import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { leadCreateSchema, leadUpdateSchema, normalizePhone, PHONE_DUPLICATE_ERROR } from '@dct-crm/shared';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { canTransitionStatus, isValidStatus } from '../services/workflow';
import { createOwnerHistory, getOwnerHistory } from '../services/ownerHistory';
import {
  canAccessLead,
  getLeadRecordScope,
  leadScopeClause,
} from '../services/recordAccess';
import { getNextSiteVisitNumber, normalizeOverdueSiteVisits } from '../services/leadWorkflowExtras';
import { changeLeadOwner, getEligibleLeadOwners } from '../services/leadOwnerChange';
import {
  findApplicableRRQueue,
  hasLeadAssignmentRelevantChanges,
  isLeadEligibleForAutoAssignment,
  RoundRobinAssignmentService,
} from '../services/rrQueue';
import { z } from 'zod';

const router = Router();

router.use(authenticate);

/**
 * Lead lookup tenant scope. Matches the existing GET / list rule: superadmin
 * sees and acts on every tenant's leads (recordAccess/authorization already
 * grant superadmin ALL-scope), while every other user stays tenant-scoped.
 */
function leadIdScope(req: AuthRequest): { tenantId?: string } {
  return req.user!.isSuperAdmin ? {} : { tenantId: req.tenantId! };
}

/**
 * Human-facing audit display: keys whose values are user IDs. The audit
 * history endpoints resolve them to display names so the UI never shows raw
 * internal user IDs. IDs are resolved in a single batched query (no N+1).
 */
const AUDIT_USER_KEYS = new Set([
  'ownerId',
  'previousOwnerId',
  'newOwnerId',
  'changedById',
  'createdById',
  'updatedById',
  'completedById',
  'cancelledById',
  'assignedById',
  'performedById',
  'userId',
  'changedBy',
  'createdBy',
  'updatedBy',
  'assignedBy',
  'performedBy',
]);

function auditDisplayValues(
  values: Record<string, unknown> | null | undefined,
  nameById: Map<string, string>,
): Record<string, unknown> | null | undefined {
  if (!values || typeof values !== 'object') return values;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (AUDIT_USER_KEYS.has(key)) {
      const siblingNameKey = key.endsWith('Id') ? `${key.slice(0, -2)}Name` : null;
      const hasSiblingName =
        !!siblingNameKey &&
        typeof (values as Record<string, unknown>)[siblingNameKey] === 'string' &&
        String((values as Record<string, unknown>)[siblingNameKey]).length > 0;
      if (hasSiblingName) {
        // Explicit *Name sibling present: keep the pair (the UI renders the
        // name row and skips the raw id — see getAuditChanges).
        out[key] = value;
        continue;
      }
      if (typeof value === 'string' && nameById.has(value)) {
        // No name sibling: resolve the id to a display name so nothing raw
        // is ever surfaced by consumers.
        out[key] = nameById.get(value);
        continue;
      }
      if (value === null && key.endsWith('ById')) {
        out[key] = 'System';
        continue;
      }
    }
    out[key] = value;
  }
  return out;
}

async function enrichAuditLogs<T extends { oldValues?: unknown; newValues?: unknown }>(logs: T[]) {
  const ids = new Set<string>();
  for (const log of logs) {
    for (const values of [log.oldValues, log.newValues]) {
      if (!values || typeof values !== 'object') continue;
      for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
        if (AUDIT_USER_KEYS.has(key) && typeof value === 'string' && value.startsWith('c')) {
          ids.add(value);
        }
      }
    }
  }
  const users = ids.size
    ? await prisma.user.findMany({
        where: { id: { in: [...ids] } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const nameById = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

  return logs.map((log) => ({
    ...log,
    oldValues: auditDisplayValues(log.oldValues as Record<string, unknown> | null | undefined, nameById),
    newValues: auditDisplayValues(log.newValues as Record<string, unknown> | null | undefined, nameById),
  }));
}

async function getNextLeadNumber(tenantId: string): Promise<string> {
  const sequence = await prisma.$transaction(async (tx) => {
    const seq = await tx.sequence.upsert({
      where: { tenantId_type: { tenantId, type: 'LEAD' } },
      update: { nextValue: { increment: 1 } },
      create: { tenantId, type: 'LEAD', nextValue: 1 },
    });
    return seq;
  });
  return `LN${String(sequence.nextValue).padStart(6, '0')}`;
}

const convertLeadSchema = z.object({
  projectId: z.string().optional(),
  unitId: z.string().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  amount: z.number().min(0).optional(),
  expectedCloseDate: z.string().datetime().optional(),
  probability: z.number().int().min(0).max(100).optional(),
  description: z.string().max(2000).optional(),
});

async function getNextOpportunityNumber(tx: any, tenantId: string): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`OPPORTUNITY_NUMBER:${tenantId}`}, 0))`;
  // Max-based (not count-based): counts drift below the highest number after any
  // opportunity deletion, which would re-issue an existing number and violate
  // the [tenantId, opportunityNumber] unique index.
  const rows = await tx.$queryRaw<{ maxn: bigint | null }[]>`
    SELECT max(CASE WHEN "opportunityNumber" ~ '^OPP[0-9]+$'
      THEN substring("opportunityNumber" from 4)::bigint END) AS maxn
    FROM "Opportunity"
    WHERE "tenantId" = ${tenantId}
  `;
  const maxn = rows?.[0]?.maxn != null ? Number(rows[0].maxn) : 0;
  return `OPP${String(maxn + 1).padStart(6, '0')}`;
}

async function findPhoneConflict(
  tenantId: string,
  phone: string,
  excludeLeadId?: string,
): Promise<boolean> {
  const normalized = normalizePhone(phone);
  const candidates = await prisma.lead.findMany({
    where: {
      tenantId,
      phone: { not: null },
      ...(excludeLeadId ? { id: { not: excludeLeadId } } : {}),
    },
    select: { id: true, phone: true },
  });
  return candidates.some(
    (lead) => lead.phone != null && normalizePhone(lead.phone) === normalized,
  );
}

function isPhoneUniqueViolation(error: any): boolean {
  if (error?.code !== 'P2002') return false;
  const target = error?.meta?.target;
  if (Array.isArray(target)) return target.includes('phone');
  if (typeof target === 'string') return target.includes('phone');
  return false;
}

type LeadDeletionStep =
  | { name: 'lead'; where: { id: string } }
  | {
      name: 'activity' | 'task' | 'followUp' | 'leadOwnerHistory' | 'payment' | 'siteVisit' | 'approval' | 'quotationItem' | 'booking' | 'quotation' | 'opportunity';
      where: Record<string, any>;
    };

export function buildLeadDeletionPlan(leadId: string): LeadDeletionStep[] {
  return [
    { name: 'activity', where: { OR: [{ leadId }, { siteVisit: { leadId } }, { opportunity: { leadId } }, { booking: { leadId } }] } },
    { name: 'task', where: { OR: [{ leadId }, { siteVisit: { leadId } }, { opportunity: { leadId } }] } },
    { name: 'followUp', where: { leadId } },
    { name: 'leadOwnerHistory', where: { leadId } },
    { name: 'payment', where: { booking: { leadId } } },
    { name: 'siteVisit', where: { leadId } },
    { name: 'approval', where: { quotation: { leadId } } },
    { name: 'quotationItem', where: { quotation: { leadId } } },
    { name: 'booking', where: { leadId } },
    { name: 'quotation', where: { leadId } },
    { name: 'opportunity', where: { leadId } },
    { name: 'lead', where: { id: leadId } },
  ];
}

const LEAD_DIFFABLE_FIELDS = [
  'firstName', 'lastName', 'salutation', 'title', 'email', 'phone', 'mobile',
  'website', 'company', 'industry', 'annualRevenue', 'numberOfEmployees',
  'source', 'status', 'rating', 'description', 'street', 'city',
  'stateProvince', 'country', 'postalCode', 'score', 'budget',
  'requirements', 'notes', 'ownerId', 'projectId',
] as const;

function normalizeDiffValue(value: any): any {
  if (value === undefined) return null;
  if (value === '') return null;
  return value;
}

function computeLeadDiff(
  existing: Record<string, any>,
  incoming: Record<string, any>,
): { oldValues: Record<string, any>; newValues: Record<string, any>; updateData: Record<string, any> } {
  const oldValues: Record<string, any> = {};
  const newValues: Record<string, any> = {};
  const updateData: Record<string, any> = {};

  for (const field of LEAD_DIFFABLE_FIELDS) {
    if (!(field in incoming)) continue;
    const incomingValue = normalizeDiffValue((incoming as Record<string, any>)[field]);
    const existingValue = normalizeDiffValue(existing[field]);
    if (incomingValue === existingValue) continue;
    oldValues[field] = existingValue;
    newValues[field] = incomingValue;
    updateData[field] = (incoming as Record<string, any>)[field] === '' ? null : (incoming as Record<string, any>)[field];
  }

  return { oldValues, newValues, updateData };
}

router.get('/', authorize('Lead', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, status, source, ownerId, search, sortBy = 'createdAt', sortOrder = 'desc', from, to } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};
    if (!req.user!.isSuperAdmin) {
      where.tenantId = req.tenantId!;
    }
    const scope = await getLeadRecordScope(req.user!);
    const scopeClause = leadScopeClause(scope);
    if (scopeClause) {
      where.AND = Array.isArray(where.AND) ? [...where.AND, scopeClause] : [scopeClause];
    }
    if (status && status !== 'All Statuses') {
      if (!isValidStatus(String(status))) {
        return res.status(400).json({ success: false, error: 'Invalid status filter' });
      }
      where.status = String(status);
    }
    if (source) where.source = source;
    if (ownerId) where.ownerId = ownerId;
    if (from || to) {
      const createdAtFilter: any = {};
      if (from) {
        const start = new Date(`${from}T00:00:00.000Z`);
        if (!Number.isNaN(start.getTime())) createdAtFilter.gte = start;
      }
      if (to) {
        const end = new Date(`${to}T23:59:59.999Z`);
        if (!Number.isNaN(end.getTime())) createdAtFilter.lte = end;
      }
      if (Object.keys(createdAtFilter).length > 0) {
        where.createdAt = createdAtFilter;
      }
    }
    if (search) {
      const searchTerm = search as string;
      const words = searchTerm.trim().split(/\s+/).filter(Boolean);
      const matchWord = (word: string) => [
        { leadNumber: { contains: word, mode: 'insensitive' as const } },
        { firstName: { contains: word, mode: 'insensitive' as const } },
        { lastName: { contains: word, mode: 'insensitive' as const } },
        { email: { contains: word, mode: 'insensitive' as const } },
        { phone: { contains: word } },
        { company: { contains: word, mode: 'insensitive' as const } },
        { title: { contains: word, mode: 'insensitive' as const } },
      ];
      const searchClause =
        words.length > 1
          ? { AND: words.map((word) => ({ OR: matchWord(word) })) }
          : { OR: matchWord(searchTerm) };
      where.AND = Array.isArray(where.AND) ? [...where.AND, searchClause] : [searchClause];
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          project: { select: { id: true, name: true } },
          _count: { select: { siteVisits: true, opportunities: true, activities: true } },
        },
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
      }),
      prisma.lead.count({ where }),
    ]);

    res.json({
      success: true,
      data: leads,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get leads error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch leads' });
  }
});

router.get('/:id', authorize('Lead', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    await normalizeOverdueSiteVisits(req.user!.tenantId);
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, ...leadIdScope(req) },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
        project: { select: { id: true, name: true } },
        siteVisits: {
          include: {
            assignee: { select: { id: true, firstName: true, lastName: true } },
            project: { select: { id: true, name: true } },
          },
          orderBy: { scheduledAt: 'desc' },
        },
        opportunities: {
          include: { owner: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
        },
        activities: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        tasks: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        followUps: {
          orderBy: { dueDate: 'asc' },
          take: 10,
        },
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (!(await canAccessLead(req.user!, lead))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
    }

    const ownerHistory = await getOwnerHistory(lead.tenantId, req.params.id);

    const lastAudit = await prisma.auditLog.findFirst({
      where: {
        tenantId: lead.tenantId,
        OR: [{ leadId: lead.id }, { objectType: 'Lead', objectId: lead.id }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    const lastModified = lastAudit
      ? {
          by: lastAudit.user,
          at: lastAudit.createdAt,
          action: lastAudit.action,
        }
      : {
          by: lead.creator
            ? { id: lead.creator.id, firstName: lead.creator.firstName, lastName: lead.creator.lastName, email: null }
            : null,
          at: lead.updatedAt,
          action: 'CREATE',
        };

    res.json({
      success: true,
      data: {
        ...lead,
        auditLogs: await enrichAuditLogs(lead.auditLogs),
        ownerHistory,
        lastModified,
      },
    });
  } catch (error) {
    console.error('Get lead error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch lead' });
  }
});

router.post('/:id/convert', authorize('Opportunity', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId: callerTenantId, id: userId } = req.user!;
    const data = convertLeadSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`LEAD_CONVERSION:${callerTenantId}:${req.params.id}`}, 0))`;

      const lead = await tx.lead.findFirst({
        where: { id: req.params.id, ...leadIdScope(req) },
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          siteVisits: {
            where: { status: 'COMPLETED' },
            orderBy: [{ completedAt: 'desc' }, { updatedAt: 'desc' }],
            take: 1,
          },
          opportunities: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });
      if (!lead) throw new Error('LEAD_NOT_FOUND');
      const tenantId = lead.tenantId;
      if (!(await canAccessLead(req.user!, lead))) throw new Error('LEAD_ACCESS_DENIED');
      if (lead.status !== 'SITE_VISIT_HAPPENED') throw new Error('LEAD_NOT_READY');
      // Conversion performs an automatic SITE_VISIT_HAPPENED -> BOOKED transition:
      // enforce the same workflow rules as PUT /:id/status (with the same admin bypass)
      const profileName = req.user!.profileName || 'Admin';
      if (profileName !== 'Admin' && profileName !== 'Manager' && profileName !== 'CRM Admin') {
        if (!canTransitionStatus(profileName, 'SITE_VISIT_HAPPENED', 'BOOKED')) {
          throw new Error(
            `CONVERSION_STATUS_FORBIDDEN|Profile ${profileName} cannot change status from SITE_VISIT_HAPPENED to BOOKED`,
          );
        }
      }
      if (lead.opportunities.length > 0) {
        return { opportunity: lead.opportunities[0], lead, duplicate: true };
      }
      const completedSiteVisit = lead.siteVisits[0];
      if (!completedSiteVisit) throw new Error('COMPLETED_SITE_VISIT_REQUIRED');

      if (data.projectId && completedSiteVisit.projectId && data.projectId !== completedSiteVisit.projectId) {
        throw new Error('PROJECT_MISMATCH');
      }
      const projectId = completedSiteVisit.projectId || data.projectId || lead.projectId || undefined;
      if (!projectId) throw new Error('PROJECT_REQUIRED');
      const project = await tx.project.findFirst({ where: { id: projectId, tenantId, isActive: true }, select: { id: true } });
      if (!project) throw new Error('INVALID_PROJECT');

      if (data.unitId) {
        const unit = await tx.unit.findFirst({
          where: { id: data.unitId, tenantId, projectId, status: 'AVAILABLE' },
          select: { id: true },
        });
        if (!unit) throw new Error('INVALID_UNIT');
      }

      const opportunityOwnerId = lead.ownerId || userId;

      // Step 13: Generate Opportunity Number
      const opportunityNumber = await getNextOpportunityNumber(tx, tenantId);
      const opportunity = await tx.opportunity.create({
        data: {
          tenantId,
          opportunityNumber,
          name: data.name || `${lead.company} Opportunity`,
          leadId: lead.id,
          ownerId: opportunityOwnerId,
          creatorId: userId,
          projectId,
          unitId: data.unitId,
          siteVisitId: completedSiteVisit.id,
          stage: 'PROSPECTING',
          amount: data.amount,
          expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : undefined,
          probability: data.probability,
          description: data.description || lead.requirements || lead.notes,
        },
        include: {
          lead: { select: { id: true, leadNumber: true, firstName: true, lastName: true } },
          owner: { select: { id: true, firstName: true, lastName: true, profile: { select: { name: true } } } },
          project: { select: { id: true, name: true } },
          unit: { select: { id: true, number: true, type: true, area: true, price: true, status: true } },
          siteVisit: { select: { id: true, siteVisitNumber: true, completedAt: true } },
        },
      });

      // Step 16: Update Lead status to BOOKED — only after Opportunity creation succeeded
      const convertedLead = await tx.lead.update({
        where: { id: lead.id },
        data: { status: 'BOOKED' },
      });

      // Step 17: Conversion audit log
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          leadId: lead.id,
          opportunityId: opportunity.id,
          action: 'LEAD_CONVERTED_TO_OPPORTUNITY',
          objectType: 'Lead',
          objectId: lead.id,
          oldValues: { status: 'SITE_VISIT_HAPPENED' },
          newValues: {
            status: 'BOOKED',
            leadNumber: lead.leadNumber,
            opportunityId: opportunity.id,
            opportunityNumber,
            ownerId: opportunityOwnerId,
            siteVisitId: completedSiteVisit.id,
            projectId,
            unitId: data.unitId || null,
          },
        },
      });

      return { opportunity, lead: convertedLead, duplicate: false };
    });
    return res.status(result.duplicate ? 200 : 201).json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ZodError') return res.status(400).json({ success: false, error: error.errors[0].message });
    if (typeof error.message === 'string' && error.message.startsWith('CONVERSION_STATUS_FORBIDDEN|')) {
      return res.status(403).json({ success: false, error: error.message.slice(error.message.indexOf('|') + 1) });
    }
    const errors: Record<string, [number, string]> = {
      LEAD_NOT_FOUND: [404, 'Lead not found'],
      LEAD_ACCESS_DENIED: [403, 'You do not have access to this lead'],
      LEAD_NOT_READY: [400, 'Lead must be Site Visit Happened before conversion'],
      COMPLETED_SITE_VISIT_REQUIRED: [400, 'A completed Site Visit is required'],
      PROJECT_REQUIRED: [400, 'Project is required'],
      INVALID_PROJECT: [400, 'Invalid project'],
      PROJECT_MISMATCH: [400, 'Opportunity project must match the completed Site Visit project'],
      INVALID_UNIT: [400, 'Unit is unavailable or does not belong to the project'],
    };
    const mapped = errors[error.message];
    if (mapped) return res.status(mapped[0]).json({ success: false, error: mapped[1] });
    console.error('Convert lead error:', error);
    return res.status(500).json({ success: false, error: 'Failed to convert lead' });
  }
});

router.post('/', authorize('Lead', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const data = leadCreateSchema.parse(req.body);

    if (await findPhoneConflict(req.tenantId!, data.phone)) {
      return res.status(409).json({ success: false, error: PHONE_DUPLICATE_ERROR });
    }

    const leadNumber = await getNextLeadNumber(req.tenantId!);

    const ownerId = req.user!.id;

    const transactionResult = await prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          tenantId: req.tenantId!,
          creatorId: req.user!.id,
          leadNumber,
          firstName: data.firstName || undefined,
          lastName: data.lastName,
          salutation: data.salutation || undefined,
          title: data.title || undefined,
          email: data.email || undefined,
          phone: normalizePhone(data.phone),
          mobile: data.mobile || undefined,
          website: data.website || undefined,
          company: data.company,
          industry: data.industry || undefined,
          annualRevenue: data.annualRevenue || undefined,
          numberOfEmployees: data.numberOfEmployees || undefined,
          source: data.source,
          status: 'NEW',
          rating: data.rating || undefined,
          description: data.description || undefined,
          street: data.street || undefined,
          city: data.city || undefined,
          stateProvince: data.stateProvince || undefined,
          country: data.country || undefined,
          postalCode: data.postalCode || undefined,
          score: data.score || 0,
          budget: data.budget || undefined,
          ownerId,
          projectId: data.projectId || undefined,
        },
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          project: { select: { id: true, name: true } },
        },
      });

      await createOwnerHistory(
        {
          tenantId: req.tenantId!,
          leadId: created.id,
          previousOwnerId: null,
          newOwnerId: ownerId,
          previousProfile: null,
          newProfile: req.user!.profileName || null,
          previousStatus: null,
          newStatus: 'NEW',
          handoffReason: 'Lead Created',
          changedById: req.user!.id,
        },
        tx,
      );

      await tx.auditLog.create({
        data: {
          tenantId: req.tenantId!,
          userId: req.user!.id,
          leadId: created.id,
          action: 'CREATE',
          objectType: 'Lead',
          objectId: created.id,
          newValues: {
            ...data,
            assignedTo: created.owner ? `${created.owner.firstName} ${created.owner.lastName}` : null,
          },
        },
      });

      const leadForAssignment = {
        ...created,
        projectId: created.projectId || data.projectId || null,
        projectName: created.project?.name || null,
        status: 'NEW',
        source: data.source,
        leadQueueing: true,
        leadAssigned: false,
      };

      const rrQueue = isLeadEligibleForAutoAssignment(leadForAssignment, { isNewLead: true })
        ? await findApplicableRRQueue(req.tenantId!, {
            projectId: leadForAssignment.projectId,
            projectName: leadForAssignment.projectName,
            status: 'NEW',
            source: String(data.source),
          }, tx)
        : null;

      const assignment = rrQueue
        ? await RoundRobinAssignmentService.assignLeadInTransaction(tx, rrQueue.id, created.id, req.tenantId!)
        : null;
      return { created, assignment };
    });
    const assignedLead = transactionResult.assignment
      ? await prisma.lead.findUnique({ where: { id: transactionResult.created.id }, include: { owner: { select: { id: true, firstName: true, lastName: true } }, project: { select: { id: true, name: true } } } })
      : transactionResult.created;
    res.status(201).json({ success: true, data: assignedLead || transactionResult.created });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    if (isPhoneUniqueViolation(error)) {
      return res.status(409).json({ success: false, error: PHONE_DUPLICATE_ERROR });
    }
    console.error('Create lead error:', error);
    res.status(500).json({ success: false, error: 'Failed to create lead' });
  }
});

router.put('/:id', authorize('Lead', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const existingLead = await prisma.lead.findFirst({
      where: { id: req.params.id, ...leadIdScope(req) },
    });

    if (!existingLead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (!(await canAccessLead(req.user!, existingLead))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
    }

    const bodyData = { ...req.body };
    delete bodyData.leadNumber;
    const reason =
      typeof bodyData.reason === 'string' && bodyData.reason.trim()
        ? bodyData.reason.trim()
        : undefined;
    delete bodyData.reason;
    const data = leadUpdateSchema.parse(bodyData);

    if (data.status && !isValidStatus(data.status)) {
      return res.status(400).json({ success: false, error: `Invalid status: ${data.status}` });
    }

    if (data.phone !== undefined && data.phone !== '') {
      const phoneToCheck = normalizePhone(data.phone);
      if (await findPhoneConflict(existingLead.tenantId, phoneToCheck, req.params.id)) {
        return res.status(409).json({ success: false, error: PHONE_DUPLICATE_ERROR });
      }
      data.phone = phoneToCheck;
    }

    if (data.status) {
      const profileName = req.user!.profileName || 'Admin';

      if (profileName !== 'Admin' && profileName !== 'Manager' && profileName !== 'CRM Admin') {
        if (!canTransitionStatus(profileName, existingLead.status, data.status)) {
          return res.status(403).json({
            success: false,
            error: `Profile ${profileName} cannot change status from ${existingLead.status} to ${data.status}`,
          });
        }
      }
    }

    const { oldValues, newValues, updateData } = computeLeadDiff(existingLead, data);

    if (Object.keys(updateData).length === 0) {
      const unchanged = await prisma.lead.findFirst({
        where: { id: req.params.id, ...leadIdScope(req) },
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          project: { select: { id: true, name: true } },
        },
      });
      return res.json({ success: true, data: unchanged, unchanged: true });
    }

    const ownerChanged =
      'ownerId' in updateData &&
      normalizeDiffValue(updateData.ownerId) !== normalizeDiffValue(existingLead.ownerId);
    const shouldReassign = hasLeadAssignmentRelevantChanges(updateData);

    const result = await prisma.$transaction(async (tx) => {
      const lead = await tx.lead.update({
        where: { id: req.params.id },
        data: updateData,
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          project: { select: { id: true, name: true } },
        },
      });

      const auditNewValues = reason ? { ...newValues, reason } : newValues;

      await tx.auditLog.create({
        data: {
          tenantId: existingLead.tenantId,
          userId: req.user!.id,
          leadId: lead.id,
          action: ownerChanged && Object.keys(newValues).length === 1 ? 'OWNER_CHANGED' : 'UPDATE',
          objectType: 'Lead',
          objectId: lead.id,
          oldValues,
          newValues: auditNewValues,
        },
      });

      if (ownerChanged) {
        const newOwnerId = normalizeDiffValue(updateData.ownerId);
        const newOwner = newOwnerId
          ? await tx.user.findUnique({
              where: { id: newOwnerId },
              select: { id: true, firstName: true, lastName: true, profile: { select: { name: true } } },
            })
          : null;

        await createOwnerHistory(
          {
            tenantId: existingLead.tenantId,
            leadId: lead.id,
            previousOwnerId: existingLead.ownerId,
            newOwnerId: newOwnerId as string | null,
            previousProfile: null,
            newProfile: newOwner?.profile?.name || null,
            previousStatus: existingLead.status,
            newStatus: lead.status,
            handoffReason: reason || 'Owner changed via lead update',
            changedById: req.user!.id,
          },
          tx,
        );
      }

      const leadForAssignment = {
        ...lead,
        projectId: Object.prototype.hasOwnProperty.call(updateData, 'projectId')
          ? updateData.projectId
          : lead.projectId || existingLead.projectId || null,
        projectName: lead.project?.name || (Object.prototype.hasOwnProperty.call(updateData, 'projectId') ? null : existingLead.projectId) || null,
        status: updateData.status ?? lead.status,
        source: updateData.source ?? lead.source,
        leadQueueing: shouldReassign,
        leadAssigned: !shouldReassign,
        leadReassign: shouldReassign,
      };

      let assignment: any = null;
      if (shouldReassign && isLeadEligibleForAutoAssignment(leadForAssignment, { isNewLead: false })) {
        const queue = await findApplicableRRQueue(existingLead.tenantId, {
          projectId: leadForAssignment.projectId,
          projectName: leadForAssignment.projectName,
          status: String(leadForAssignment.status),
          source: String(leadForAssignment.source),
          priority: String(leadForAssignment.rating || ''),
        }, tx);
        if (queue) {
          assignment = await RoundRobinAssignmentService.assignLeadInTransaction(tx, queue.id, lead.id, existingLead.tenantId);
        }
      }

      return { ...lead, assignment };
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    if (isPhoneUniqueViolation(error)) {
      return res.status(409).json({ success: false, error: PHONE_DUPLICATE_ERROR });
    }
    if (error?.message === 'NO_ELIGIBLE_USER') {
      return res.status(409).json({
        success: false,
        error: 'No eligible RR queue member or fallback owner is available for this lead.',
      });
    }
    console.error('Update lead error:', error);
    res.status(500).json({ success: false, error: 'Failed to update lead' });
  }
});

router.delete('/:id', authorize('Lead', 'delete'), async (req: AuthRequest, res: Response) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, ...leadIdScope(req) },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (!(await canAccessLead(req.user!, lead))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: lead.tenantId,
        userId: req.user!.id,
        action: 'DELETE',
        objectType: 'Lead',
        objectId: lead.id,
        oldValues: lead,
      },
    });

    await prisma.$transaction(async (tx) => {
      const cleanupPlan = buildLeadDeletionPlan(lead.id);

      for (const step of cleanupPlan) {
        if (step.name === 'lead') {
          await tx.lead.delete({ where: step.where });
          continue;
        }

        if (step.name === 'activity') {
          await tx.activity.deleteMany({ where: step.where as any });
          continue;
        }

        if (step.name === 'task') {
          await tx.task.deleteMany({ where: step.where as any });
          continue;
        }

        if (step.name === 'followUp') {
          await tx.followUp.deleteMany({ where: step.where as any });
          continue;
        }

        if (step.name === 'leadOwnerHistory') {
          await tx.leadOwnerHistory.deleteMany({ where: step.where as any });
          continue;
        }

        if (step.name === 'payment') {
          await tx.payment.deleteMany({ where: step.where as any });
          continue;
        }

        if (step.name === 'siteVisit') {
          await tx.siteVisit.deleteMany({ where: step.where as any });
          continue;
        }

        if (step.name === 'approval') {
          await tx.approval.deleteMany({ where: step.where as any });
          continue;
        }

        if (step.name === 'quotationItem') {
          await tx.quotationItem.deleteMany({ where: step.where as any });
          continue;
        }

        if (step.name === 'booking') {
          await tx.booking.deleteMany({ where: step.where as any });
          continue;
        }

        if (step.name === 'quotation') {
          await tx.quotation.deleteMany({ where: step.where as any });
          continue;
        }

        if (step.name === 'opportunity') {
          await tx.opportunity.deleteMany({ where: step.where as any });
        }
      }
    });

    res.json({ success: true, message: 'Lead deleted successfully' });
  } catch (error) {
    console.error('Delete lead error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete lead' });
  }
});

router.post('/:id/push-to-svc', authorize('Lead', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'Reason/note is required for status change' });
    }

    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, ...leadIdScope(req) },
      include: { owner: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (!(await canAccessLead(req.user!, lead))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
    }

    if (lead.status !== 'INCOMING') {
      return res.status(400).json({ success: false, error: 'Lead must be in Incoming status to push to SVC' });
    }

    const profileName = req.user!.profileName || 'Admin';

    if (profileName !== 'Admin' && profileName !== 'Manager' && profileName !== 'CRM Admin') {
      if (!canTransitionStatus(profileName, 'INCOMING', 'PROSPECT')) {
        return res.status(403).json({ success: false, error: 'Not authorized to push leads to SVC' });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedLead = await tx.lead.update({
        where: { id: req.params.id },
        data: { status: 'PROSPECT' },
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: lead.tenantId,
          userId: req.user!.id,
          leadId: lead.id,
          action: 'PUSH_TO_SVC',
          objectType: 'Lead',
          objectId: lead.id,
          oldValues: { status: 'INCOMING', ownerId: lead.ownerId },
          newValues: {
            status: 'PROSPECT',
            note: reason,
            reason,
          },
        },
      });

      return updatedLead;
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Push to SVC error:', error);
    res.status(500).json({ success: false, error: 'Failed to push lead to SVC' });
  }
});

router.post('/:id/move-to-recovery', authorize('Lead', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { recoveryReason, note } = req.body;
    if (!recoveryReason || !recoveryReason.trim()) {
      return res.status(400).json({ success: false, error: 'Recovery reason is required' });
    }

    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, ...leadIdScope(req) },
      include: { owner: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (!(await canAccessLead(req.user!, lead))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
    }

    if (lead.status !== 'INCOMING' && lead.status !== 'NEW') {
      return res.status(400).json({ success: false, error: 'Lead must be in New or Incoming status to move to recovery' });
    }

    const profileName = req.user!.profileName || 'Admin';

    if (profileName !== 'Admin' && profileName !== 'Manager' && profileName !== 'CRM Admin') {
      if (!canTransitionStatus(profileName, lead.status, 'LOST')) {
        return res.status(403).json({ success: false, error: 'Not authorized to move this lead to recovery' });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedLead = await tx.lead.update({
        where: { id: req.params.id },
        data: { status: 'LOST' },
        include: { owner: { select: { id: true, firstName: true, lastName: true } } },
      });

      await createOwnerHistory(
        {
          tenantId: lead.tenantId,
          leadId: lead.id,
          previousOwnerId: lead.ownerId,
          newOwnerId: null,
          previousProfile: profileName,
          newProfile: 'Recovery',
          previousStatus: lead.status,
          newStatus: 'LOST',
          handoffReason: recoveryReason,
          changedById: req.user!.id,
        },
        tx,
      );

      await tx.auditLog.create({
        data: {
          tenantId: lead.tenantId,
          userId: req.user!.id,
          leadId: lead.id,
          action: 'MOVE_TO_RECOVERY',
          objectType: 'Lead',
          objectId: lead.id,
          oldValues: { status: lead.status, ownerId: lead.ownerId },
          newValues: { status: 'LOST', recoveryReason, recoveryNote: note, reason: recoveryReason },
        },
      });

      return updatedLead;
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Move to recovery error:', error);
    res.status(500).json({ success: false, error: 'Failed to move lead to recovery' });
  }
});

router.post('/:id/schedule-site-visit', authorize('Lead', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const request = z.object({
      projectId: z.string().trim().min(1, 'Project is required for site visit'),
      notes: z.string().trim().min(1, 'Note/reason is required for site visit').max(2000),
      scheduledAt: z.string().datetime('Visit date/time is required'),
    }).safeParse(req.body);
    if (!request.success) {
      return res.status(400).json({ success: false, error: request.error.issues[0].message });
    }
    const { scheduledAt, notes, projectId } = request.data;

    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, ...leadIdScope(req) },
      include: { owner: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (!(await canAccessLead(req.user!, lead))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
    }

    if (lead.status !== 'PROSPECT') {
      return res.status(400).json({ success: false, error: 'Lead must be in Prospect status to schedule site visit' });
    }

    const profileName = req.user!.profileName || 'Admin';

    if (profileName !== 'Admin' && profileName !== 'Manager' && profileName !== 'CRM Admin') {
      if (!canTransitionStatus(profileName, 'PROSPECT', 'SITE_VISIT_SCHEDULED')) {
        return res.status(403).json({ success: false, error: 'Not authorized to schedule site visits' });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const project = await tx.project.findFirst({
        where: { id: projectId, tenantId: lead.tenantId, isActive: true },
        select: { id: true },
      });
      if (!project) {
        throw new Error('PROJECT_NOT_AVAILABLE');
      }

      const siteVisitNumber = await getNextSiteVisitNumber(tx, lead.tenantId);
      const siteVisit = await tx.siteVisit.create({
        data: {
          tenantId: lead.tenantId,
          leadId: lead.id,
          projectId,
          assigneeId: lead.ownerId || req.user!.id,
          creatorId: req.user!.id,
          siteVisitNumber,
          scheduledAt: new Date(scheduledAt),
          status: 'SCHEDULED',
          notes,
        },
        include: {
          assignee: { select: { id: true, firstName: true, lastName: true } },
          project: { select: { id: true, name: true } },
        },
      });

      const updatedLead = await tx.lead.update({
        where: { id: req.params.id },
        data: { status: 'SITE_VISIT_SCHEDULED' },
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: lead.tenantId,
          userId: req.user!.id,
          leadId: lead.id,
          action: 'SITE_VISIT_SCHEDULED',
          objectType: 'Lead',
          objectId: lead.id,
          oldValues: { status: 'PROSPECT', ownerId: lead.ownerId },
          newValues: {
            status: 'SITE_VISIT_SCHEDULED',
            siteVisitId: siteVisit.id,
            note: notes,
            reason: notes,
          },
        },
      });

      return { lead: updatedLead, siteVisit };
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error?.message === 'PROJECT_NOT_AVAILABLE') {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    console.error('Schedule site visit error:', error);
    res.status(500).json({ success: false, error: 'Failed to schedule site visit' });
  }
});

router.put('/:id/status', authorize('Lead', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { status, note } = req.body;

    if (!isValidStatus(status)) {
      return res.status(400).json({ success: false, error: `Invalid status: ${status}` });
    }

    if (!note || !note.trim()) {
      return res.status(400).json({ success: false, error: 'A note/reason is required for status change' });
    }

    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, ...leadIdScope(req) },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (!(await canAccessLead(req.user!, lead))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
    }

    if (lead.status === status) {
      return res.status(400).json({ success: false, error: `Lead is already in ${status} status` });
    }

    const profileName = req.user!.profileName || 'Admin';

    if (profileName !== 'Admin' && profileName !== 'Manager' && profileName !== 'CRM Admin') {
      if (!canTransitionStatus(profileName, lead.status, status)) {
        return res.status(403).json({
          success: false,
          error: `Profile ${profileName} cannot change status from ${lead.status} to ${status}`,
        });
      }
    }

    const updatedLead = await prisma.lead.update({
      where: { id: req.params.id },
      data: { status },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: lead.tenantId,
        userId: req.user!.id,
        leadId: lead.id,
        action: 'STATUS_CHANGE',
        objectType: 'Lead',
        objectId: lead.id,
        oldValues: { status: lead.status },
        newValues: { status, note, reason: note },
      },
    });

    res.json({ success: true, data: updatedLead });
  } catch (error) {
    console.error('Update lead status error:', error);
    res.status(500).json({ success: false, error: 'Failed to update lead status' });
  }
});

router.patch('/:id/owner', authorize('Lead', 'assign'), async (req: AuthRequest, res: Response) => {
  try {
    const { ownerId, reason } = req.body || {};
    const data = await changeLeadOwner({
      leadId: req.params.id,
      newOwnerId: typeof ownerId === 'string' ? ownerId : '',
      reason: typeof reason === 'string' ? reason : '',
      changedBy: req.user!,
    });
    res.json({ success: true, data });
  } catch (error: any) {
    const message = error?.message || 'Failed to change lead owner';
    const status = message === 'Lead not found' ? 404
      : message.includes('access') || message.includes('permission') ? 403
      : message.includes('required') || message.includes('different') || message.includes('eligible') ? 400
      : 500;
    if (status === 500) console.error('Change lead owner error:', error);
    res.status(status).json({ success: false, error: message });
  }
});

router.put('/:id/assign', authorize('Lead', 'assign'), async (req: AuthRequest, res: Response) => {
  try {
    const data = await changeLeadOwner({
      leadId: req.params.id,
      newOwnerId: typeof req.body?.ownerId === 'string' ? req.body.ownerId : '',
      reason: typeof req.body?.reason === 'string' ? req.body.reason : '',
      changedBy: req.user!,
    });
    res.json({ success: true, data });
  } catch (error: any) {
    const message = error?.message || 'Failed to change lead owner';
    const status = message === 'Lead not found' ? 404
      : message.includes('access') ? 403
      : message.includes('required') || message.includes('different') || message.includes('eligible') ? 400
      : 500;
    if (status === 500) console.error('Assign lead error:', error);
    res.status(status).json({ success: false, error: message });
  }
});

router.get('/:id/owner-candidates', authorize('Lead', 'assign'), async (req: AuthRequest, res: Response) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, ...leadIdScope(req) },
      select: { id: true, tenantId: true, ownerId: true, creatorId: true },
    });
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    if (!(await canAccessLead(req.user!, lead))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
    }
    const candidates = await getEligibleLeadOwners(lead.tenantId, lead.ownerId);
    res.json({ success: true, data: candidates });
  } catch (error) {
    console.error('Get lead owner candidates error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch eligible owners' });
  }
});

router.get('/:id/owner-history', authorize('Lead', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, ...leadIdScope(req) },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (!(await canAccessLead(req.user!, lead))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
    }

    const history = await getOwnerHistory(lead.tenantId, req.params.id);
    res.json({ success: true, data: history });
  } catch (error) {
    console.error('Get owner history error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch owner history' });
  }
});

router.get('/:id/audit-history', authorize('Lead', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, action } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, ...leadIdScope(req) },
      select: { id: true, tenantId: true, ownerId: true, creatorId: true },
    });

    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    if (!(await canAccessLead(req.user!, lead))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this lead' });
    }

    const where: any = {
      tenantId: lead.tenantId,
      OR: [{ leadId: lead.id }, { objectType: 'Lead', objectId: lead.id }],
    };
    if (action) where.action = action;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      success: true,
      data: await enrichAuditLogs(logs),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get lead audit history error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch lead audit history' });
  }
});

export { router as leadRoutes };