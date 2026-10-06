import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  calculateQueueMatchScore,
  RoundRobinAssignmentService,
} from '../services/rrQueue';

const router = Router();
router.use(authenticate);

function requireAdmin(req: AuthRequest, res: Response) {
  if (req.user?.isSuperAdmin || req.user?.isAdmin) return true;
  res.status(403).json({ success: false, error: 'Admin access required' });
  return false;
}

const jsonList = z.array(z.string().trim().min(1)).default([]);
const queueInput = z.object({
  name: z.string().trim().min(1, 'Complete this field.'),
  leadStatus: jsonList.optional(),
  leadSource: jsonList.optional(),
  secondarySource: jsonList.optional(),
  tertiarySource: jsonList.optional(),
  leadPriority: jsonList.optional(),
  category: jsonList.optional(),
  projectInterested: jsonList.optional(),
  country: jsonList.optional(),
  excludeFromNoSource: jsonList.optional(),
  presalesQueue: z.boolean().optional(),
  active: z.boolean().optional(),
  ownerId: z.string().nullable().optional(),
  defaultOwnerId: z.string().nullable().optional(),
  leadCount: z.number().int().nonnegative().optional(),
  previousId: z.number().int().nonnegative().optional(),
  startTime: z.string().datetime().optional().nullable(),
  endTime: z.string().datetime().optional().nullable(),
});
const queueUpdateInput = queueInput.partial();

function queueData(input: z.infer<typeof queueInput>) {
  return {
    name: input.name,
    leadStatus: input.leadStatus || [],
    leadSource: input.leadSource || [],
    secondarySource: input.secondarySource || [],
    tertiarySource: input.tertiarySource || [],
    leadPriority: input.leadPriority || [],
    category: input.category || [],
    projectInterested: input.projectInterested || [],
    country: input.country || [],
    excludeFromNoSource: input.excludeFromNoSource || [],
    presalesQueue: input.presalesQueue ?? false,
    active: input.active ?? true,
    ownerId: input.ownerId || null,
    defaultOwnerId: input.defaultOwnerId || null,
    leadCount: input.leadCount ?? 0,
    previousId: input.previousId ?? 0,
    startTime: input.startTime ? new Date(input.startTime) : null,
    endTime: input.endTime ? new Date(input.endTime) : null,
  };
}

async function nextMemberName(tx: any, tenantId: string) {
  const sequence = await tx.sequence.findUnique({
    where: { tenantId_type: { tenantId, type: 'RRMEMBER' } },
  });

  let nextValue = sequence ? Math.max(1, Number(sequence.nextValue) || 1) : 1;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = `UID-${String(nextValue).padStart(4, '0')}`;
    const existing = await tx.rRQueueMember.findFirst({
      where: { tenantId, name: candidate },
      select: { id: true },
    });

    if (!existing) {
      await tx.sequence.upsert({
        where: { tenantId_type: { tenantId, type: 'RRMEMBER' } },
        update: { nextValue: nextValue + 1 },
        create: { tenantId, type: 'RRMEMBER', nextValue: nextValue + 1 },
      });
      return candidate;
    }

    nextValue += 1;
  }

  throw new Error('UNABLE_TO_GENERATE_MEMBER_NAME');
}

async function historyActorName(tx: any, req: AuthRequest) {
  const actor = await tx.user.findFirst({
    where: { id: req.user!.id, tenantId: req.tenantId! },
    select: { firstName: true, lastName: true },
  });
  return `${actor?.firstName || ''} ${actor?.lastName || ''}`.trim() || req.user?.email || req.user!.id;
}

function memberUserName(user: { firstName?: string | null; lastName?: string | null }) {
  return `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown user';
}

router.get('/', async (req: AuthRequest, res: Response) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const queues = await prisma.rRQueue.findMany({
    where: { tenantId: req.tenantId!, ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}) },
    include: { owner: { select: { id: true, firstName: true, lastName: true } }, _count: { select: { members: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: queues.map((queue) => ({ ...queue, noOfUsers: queue._count.members })) });
});

router.get('/options', async (req: AuthRequest, res: Response) => {
  const [fields, projects] = await Promise.all([
    prisma.fieldDefinition.findMany({
      where: { tenantId: req.tenantId!, name: { in: ['status', 'source'] }, object: { name: 'Lead' } },
      include: { picklistValues: { where: { isActive: true }, orderBy: { displayOrder: 'asc' } } },
    }),
    prisma.project.findMany({ where: { tenantId: req.tenantId!, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  const values = (name: string) => fields.find((field) => field.name === name)?.picklistValues.map((item) => ({ value: item.value, label: item.label })) || [];
  res.json({ success: true, data: { statuses: values('status'), sources: values('source'), projects: projects.map((project) => ({ value: project.id, label: project.name })) } });
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const queue = await prisma.rRQueue.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId! },
    include: {
      owner: { select: { id: true, firstName: true, lastName: true, email: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      updatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      members: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } } }, orderBy: { sequenceId: 'asc' } },
      history: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  });
  if (!queue) return res.status(404).json({ success: false, error: 'Round Robin Queue not found.' });
  res.json({ success: true, data: { ...queue, noOfUsers: queue.members.filter((member) => member.activeMember && member.user.isActive).length } });
});

router.post('/', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const parsed = queueInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  try {
    const queue = await prisma.rRQueue.create({ data: { tenantId: req.tenantId!, createdById: req.user!.id, ...queueData(parsed.data) } });
    res.status(201).json({ success: true, data: queue });
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ success: false, error: 'A queue with this name already exists.' });
    res.status(500).json({ success: false, error: 'Failed to create Round Robin Queue.' });
  }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const parsed = queueUpdateInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0].message });
  try {
    const queue = await prisma.rRQueue.updateMany({
      where: { id: req.params.id, tenantId: req.tenantId! },
      data: { ...parsed.data, updatedById: req.user!.id },
    });
    if (!queue.count) return res.status(404).json({ success: false, error: 'Round Robin Queue not found.' });
    res.json({ success: true, data: await prisma.rRQueue.findUnique({ where: { id: req.params.id } }) });
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ success: false, error: 'A queue with this name already exists.' });
    res.status(500).json({ success: false, error: 'Failed to update Round Robin Queue.' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const deleted = await prisma.rRQueue.deleteMany({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!deleted.count) return res.status(404).json({ success: false, error: 'Round Robin Queue not found.' });
  res.json({ success: true });
});

router.get('/:id/members', async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const where = { rrQueueId: req.params.id, tenantId: req.tenantId! };
  const [members, total] = await Promise.all([
    prisma.rRQueueMember.findMany({ where, include: { user: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } } }, orderBy: { sequenceId: 'asc' }, skip: (page - 1) * limit, take: limit }),
    prisma.rRQueueMember.count({ where }),
  ]);
  res.json({ success: true, data: members, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

router.get('/:id/members/:memberId', async (req: AuthRequest, res: Response) => {
  const member = await prisma.rRQueueMember.findFirst({
    where: { id: req.params.memberId, rrQueueId: req.params.id, tenantId: req.tenantId! },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } },
      rrQueue: { select: { id: true, name: true } },
    },
  });
  if (!member) return res.status(404).json({ success: false, error: 'Queue member not found.' });

  const leadScope = { tenantId: req.tenantId!, rrQueueId: member.rrQueueId, ownerId: member.userId };
  const [leadsOwned, noOfNewLeads] = await Promise.all([
    prisma.lead.count({ where: leadScope }),
    prisma.lead.count({ where: { ...leadScope, status: 'NEW' } }),
  ]);

  res.json({
    success: true,
    data: {
      ...member,
      userIdNumber: member.userIdNumber?.toString() ?? null,
      active: member.activeMember && member.user.isActive,
      leadsOwned,
      noOfNewLeads,
    },
  });
});

router.post('/:id/members', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const parsed = z.object({
    userId: z.string().min(1),
    userIdNumber: z.union([z.string().regex(/^\d{1,18}$/), z.literal(''), z.null()]).optional().transform((value) => value === '' ? null : value),
    activeMember: z.boolean().optional(),
    maxLeadCapacity: z.number().int().min(-1).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'User is required.' });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const queue = await tx.rRQueue.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
      if (!queue) throw new Error('QUEUE_NOT_FOUND');
      const user = await tx.user.findFirst({ where: { id: parsed.data.userId, tenantId: req.tenantId!, isActive: true } });
      if (!user) throw new Error('USER_NOT_FOUND');
      const existing = await tx.rRQueueMember.findUnique({ where: { rrQueueId_userId: { rrQueueId: queue.id, userId: user.id } } });
      if (existing) throw new Error('DUPLICATE_MEMBER');
      const last = await tx.rRQueueMember.findFirst({ where: { rrQueueId: queue.id }, orderBy: { sequenceId: 'desc' } });
      const member = await tx.rRQueueMember.create({
        data: {
          tenantId: req.tenantId!,
          name: await nextMemberName(tx, req.tenantId!),
          rrQueueId: queue.id,
          userId: user.id,
          userIdNumber: parsed.data.userIdNumber ?? null,
          sequenceId: (last?.sequenceId || 0) + 1,
          activeMember: parsed.data.activeMember ?? true,
          maxLeadCapacity: parsed.data.maxLeadCapacity ?? -1,
        } as any,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } } },
      }).catch((error: any) => {
        if (error?.code === 'P2002') throw new Error('DUPLICATE_MEMBER');
        throw error;
      });
      await tx.rRQueue.update({ where: { id: queue.id }, data: { noOfUsers: { increment: member.activeMember ? 1 : 0 } } });
      await tx.rRQueueHistory.createMany({
        data: [{
          tenantId: req.tenantId!,
          rrQueueId: queue.id,
          field: 'Created.',
          userId: req.user!.id,
          userName: await historyActorName(tx, req),
          originalValue: null,
          newValue: `${member.name} (${memberUserName(member.user)})`,
        }],
      });
      return member;
    });
    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    console.error('Add RRQueue member error:', error);
    const messages: Record<string, [number, string]> = {
      QUEUE_NOT_FOUND: [404, 'Round Robin Queue not found.'],
      USER_NOT_FOUND: [404, 'User not found.'],
      DUPLICATE_MEMBER: [409, 'User is already a member of this queue.'],
      UNABLE_TO_GENERATE_MEMBER_NAME: [500, 'Unable to generate a unique queue member name.'],
    };

    if (messages[error.message]) return res.status(messages[error.message][0]).json({ success: false, error: messages[error.message][1] });
    if (error?.code === 'P2002') return res.status(409).json({ success: false, error: 'This queue member already exists.' });
    res.status(500).json({ success: false, error: 'Failed to add queue member.' });
  }
});

router.put('/:id/members/:memberId', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const parsed = z.object({
    activeMember: z.boolean().optional(),
    userId: z.string().min(1).optional(),
    userIdNumber: z.union([z.string().regex(/^\d{1,18}$/), z.literal(''), z.null()]).optional().transform((value) => value === '' ? null : value),
    maxLeadCapacity: z.number().int().min(-1).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid member details.' });
  let updated: any;
  try {
    updated = await prisma.$transaction(async (tx) => {
      const member = await tx.rRQueueMember.findFirst({
        where: { id: req.params.memberId, rrQueueId: req.params.id, tenantId: req.tenantId! },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      });
      if (!member) return null;
      let nextUser: any;
      if (parsed.data.userId) {
        nextUser = await tx.user.findFirst({
          where: { id: parsed.data.userId, tenantId: req.tenantId!, isActive: true },
          select: { id: true, firstName: true, lastName: true },
        });
        if (!nextUser) throw new Error('ACTIVE_USER_NOT_FOUND');
      }

      const data = {
        ...(parsed.data.activeMember === undefined ? {} : { activeMember: parsed.data.activeMember }),
        ...(nextUser ? { userId: nextUser.id } : {}),
        ...(parsed.data.userIdNumber === undefined ? {} : { userIdNumber: parsed.data.userIdNumber }),
        ...(parsed.data.maxLeadCapacity === undefined ? {} : { maxLeadCapacity: parsed.data.maxLeadCapacity }),
      } as any;
      const result = await tx.rRQueueMember.update({ where: { id: member.id }, data });
      const prefix = `${member.name} - `;
      const changes: Array<{ field: string; originalValue: string | null; newValue: string | null }> = [];
      if (nextUser && nextUser.id !== member.userId) {
        changes.push({ field: `${prefix}User`, originalValue: memberUserName(member.user), newValue: memberUserName(nextUser) });
      }
      const oldUserIdNumber = member.userIdNumber?.toString() ?? null;
      const newUserIdNumber = parsed.data.userIdNumber === undefined ? oldUserIdNumber : parsed.data.userIdNumber;
      if (newUserIdNumber !== oldUserIdNumber) {
        changes.push({ field: `${prefix}user id`, originalValue: oldUserIdNumber, newValue: newUserIdNumber });
      }
      if (parsed.data.activeMember !== undefined && parsed.data.activeMember !== member.activeMember) {
        changes.push({ field: `${prefix}Active Member`, originalValue: member.activeMember ? 'Active' : 'Inactive', newValue: parsed.data.activeMember ? 'Active' : 'Inactive' });
        await tx.rRQueue.update({
          where: { id: member.rrQueueId },
          data: { noOfUsers: { increment: parsed.data.activeMember ? 1 : -1 } },
        });
      }
      if (changes.length) {
        const userName = await historyActorName(tx, req);
        await tx.rRQueueHistory.createMany({
          data: changes.map((change) => ({
            tenantId: req.tenantId!,
            rrQueueId: member.rrQueueId,
            field: change.field,
            userId: req.user!.id,
            userName,
            originalValue: change.originalValue,
            newValue: change.newValue,
          })),
        });
      }
      return result;
    });
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(409).json({ success: false, error: 'This user is already a member of the queue.' });
    if (error?.message === 'ACTIVE_USER_NOT_FOUND') return res.status(404).json({ success: false, error: 'Active user not found.' });
    throw error;
  }
  if (!updated) return res.status(404).json({ success: false, error: 'Queue member not found.' });
  res.json({ success: true, data: updated });
});

router.delete('/:id/members/:memberId', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const deleted = await prisma.$transaction(async (tx) => {
    const member = await tx.rRQueueMember.findFirst({
      where: { id: req.params.memberId, rrQueueId: req.params.id, tenantId: req.tenantId! },
      include: { user: { select: { firstName: true, lastName: true, isActive: true } } },
    });
    if (!member) return false;
    await tx.rRQueueHistory.createMany({
      data: [{
        tenantId: req.tenantId!,
        rrQueueId: member.rrQueueId,
        field: 'Deleted.',
        userId: req.user!.id,
        userName: await historyActorName(tx, req),
        originalValue: `${member.name} (${memberUserName(member.user)})`,
        newValue: null,
      }],
    });
    await tx.rRQueueMember.delete({ where: { id: member.id } });
    if (member.activeMember && member.user.isActive) {
      await tx.rRQueue.update({ where: { id: member.rrQueueId }, data: { noOfUsers: { decrement: 1 } } });
    }
    return true;
  });
  if (!deleted) return res.status(404).json({ success: false, error: 'Queue member not found.' });
  res.json({ success: true });
});

router.get('/:id/history', async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const where = { rrQueueId: req.params.id, tenantId: req.tenantId! };
  const [history, total] = await Promise.all([
    prisma.rRQueueHistory.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.rRQueueHistory.count({ where }),
  ]);
  res.json({ success: true, data: history, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

router.post('/preview', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const parsed = z.object({
    projectId: z.string().optional().nullable(),
    projectName: z.string().optional().nullable(),
    status: z.string().optional().nullable(),
    source: z.string().optional().nullable(),
    secondarySource: z.string().optional().nullable(),
    tertiarySource: z.string().optional().nullable(),
    priority: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid preview payload.' });

  const criteria = parsed.data;
  const queues = await prisma.rRQueue.findMany({ where: { tenantId: req.tenantId! }, orderBy: { createdAt: 'asc' } });
  const scores = queues.map((queue) => ({
    queue,
    score: calculateQueueMatchScore(queue as any, {
      status: criteria.status,
      source: criteria.source,
      secondarySource: criteria.secondarySource,
      tertiarySource: criteria.tertiarySource,
      priority: criteria.priority,
      category: criteria.category,
      projectId: criteria.projectId,
      projectName: criteria.projectName,
    }),
  })).sort((left, right) => right.score - left.score);

  const selectedQueue = scores.find(({ score }) => score > 0)?.queue ?? scores[0]?.queue ?? null;
  const preview = selectedQueue
    ? await RoundRobinAssignmentService.getNextEligibleMember(selectedQueue.id, req.tenantId!, prisma)
    : { member: null, skipped: ['No matching queue'] };

  res.json({
    success: true,
    data: {
      matchingQueues: scores.map(({ queue, score }) => ({ id: queue.id, name: queue.name, score })),
      selectedQueue: selectedQueue ? { id: selectedQueue.id, name: selectedQueue.name, score: scores[0]?.score ?? 0 } : null,
      queueCount: selectedQueue?.leadCount ?? 0,
      users: selectedQueue ? selectedQueue.noOfUsers : 0,
      roundRobin: preview,
    },
  });
});

router.post('/:id/assign', async (req: AuthRequest, res: Response) => {
  const parsed = z.object({ leadId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Lead is required.' });
  try {
    res.json({ success: true, ...(await RoundRobinAssignmentService.assignLead(req.params.id, parsed.data.leadId, req.tenantId!)) });
  } catch (error: any) {
    const messages: Record<string, [number, string]> = { RR_QUEUE_NOT_FOUND: [404, 'Round Robin Queue not found.'], LEAD_NOT_FOUND: [404, 'Lead not found.'], NO_ACTIVE_MEMBERS: [409, 'No active members available in this Round Robin Queue.'] };
    if (messages[error.message]) return res.status(messages[error.message][0]).json({ success: false, error: messages[error.message][1] });
    res.status(500).json({ success: false, error: 'Lead assignment failed. No queue state was changed.' });
  }
});

router.get('/:id/next-member', async (req: AuthRequest, res: Response) => {
  const member = await RoundRobinAssignmentService.getNextMember(req.params.id, req.tenantId!);
  if (!member) return res.status(409).json({ success: false, error: 'No active members available in this Round Robin Queue.' });
  res.json({ success: true, data: member });
});

router.post('/:id/reset-pointer', async (req: AuthRequest, res: Response) => {
  if (!requireAdmin(req, res)) return;
  await RoundRobinAssignmentService.resetQueuePointer(req.params.id, req.tenantId!);
  res.json({ success: true, previousId: 0 });
});

export default router;
