import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { EffectivePermissionService } from '../services/effectivePermissions';
import { getOpportunityVisibilityFilter, getScopeClause } from '../services/recordAccess';

const router = Router();

router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { q, types, status, owner, limit = 20 } = req.query;

    if (!q || (q as string).trim().length < 2) {
      return res.status(400).json({ success: false, error: 'Search query must be at least 2 characters' });
    }

    const searchTerm = q as string;
    const allowedTypes = types ? (types as string).split(',') : [
      'leads', 'opportunities', 'bookings', 'payments', 'projects', 'units', 'tasks',
    ];

    const searchConfig: Record<string, { model: any; titleField: string; subtitleField: string; urlPrefix: string; whereExtra?: any }> = {
      leads: {
        model: prisma.lead,
        titleField: 'firstName',
        subtitleField: 'phone',
        urlPrefix: '/leads',
        whereExtra: {
          OR: [
            { leadNumber: { contains: searchTerm, mode: 'insensitive' } },
            { firstName: { contains: searchTerm, mode: 'insensitive' } },
            { lastName: { contains: searchTerm, mode: 'insensitive' } },
            { phone: { contains: searchTerm } },
            { email: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
      },
      opportunities: {
        model: prisma.opportunity,
        titleField: 'name',
        subtitleField: 'stage',
        urlPrefix: '/opportunities',
        whereExtra: {
          name: { contains: searchTerm, mode: 'insensitive' },
        },
      },
      bookings: {
        model: prisma.booking,
        titleField: 'number',
        subtitleField: 'status',
        urlPrefix: '/bookings',
        whereExtra: {
          number: { contains: searchTerm, mode: 'insensitive' },
        },
      },
      payments: {
        model: prisma.payment,
        titleField: 'reference',
        subtitleField: 'status',
        urlPrefix: '/payments',
        whereExtra: {
          OR: [
            { reference: { contains: searchTerm, mode: 'insensitive' } },
            { notes: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
      },
      projects: {
        model: prisma.project,
        titleField: 'name',
        subtitleField: 'city',
        urlPrefix: '/projects',
        whereExtra: {
          OR: [
            { name: { contains: searchTerm, mode: 'insensitive' } },
            { city: { contains: searchTerm, mode: 'insensitive' } },
            { address: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
      },
      units: {
        model: prisma.unit,
        titleField: 'number',
        subtitleField: 'type',
        urlPrefix: '/units',
        whereExtra: {
          number: { contains: searchTerm, mode: 'insensitive' },
        },
      },
      tasks: {
        model: prisma.task,
        titleField: 'title',
        subtitleField: 'status',
        urlPrefix: '/tasks',
        whereExtra: {
          OR: [
            { title: { contains: searchTerm, mode: 'insensitive' } },
            { description: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
      },
    };

    const searchPromises = allowedTypes
      .filter((type) => searchConfig[type])
      .map(async (type) => {
        const config = searchConfig[type];
        if (type === 'opportunities') {
          const perms = await EffectivePermissionService.getEffectivePermissionsCached(req.user!, req.user!.id);
          if (!EffectivePermissionService.hasPermissionIn(perms, 'OPPORTUNITY_READ')) return [];
        }
        const where: any = { tenantId: req.tenantId!, ...config.whereExtra };
        if (type === 'leads') {
          const clause = await getScopeClause(req.user!, 'lead');
          if (clause) where.AND = [clause];
        }
        if (type === 'tasks') {
          const clause = await getScopeClause(req.user!, 'task');
          if (clause) where.AND = [clause];
        }
        if (type === 'opportunities') Object.assign(where, await getOpportunityVisibilityFilter(req.tenantId!, req.user!.id, 'read'));
        if (status && type !== 'payments') where.status = status;
        if (owner && ['leads', 'opportunities', 'tasks'].includes(type)) where.ownerId = owner;

        const items = await config.model.findMany({
          where,
          take: Number(limit),
          orderBy: { createdAt: 'desc' },
        });

        return items.map((item: any) => ({
          id: item.id,
          type,
          title: item[config.titleField] || 'Untitled',
          subtitle: item[config.subtitleField] || '',
          url: `${config.urlPrefix}/${item.id}`,
          tenantId: req.tenantId,
          data: item,
        }));
      });

    const searchResults = await Promise.all(searchPromises);
    const flatResults = searchResults.flat().slice(0, Number(limit));

    res.json({ success: true, data: flatResults, total: flatResults.length });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

router.get('/quick', async (req: AuthRequest, res: Response) => {
  try {
    const { q, limit = 5 } = req.query;

    if (!q || (q as string).trim().length < 2) {
      return res.json({ success: true, data: [] });
    }

    const searchTerm = q as string;
    const numLimit = Number(limit);

    const perms = await EffectivePermissionService.getEffectivePermissionsCached(req.user!, req.user!.id);
    const canReadOpportunities = EffectivePermissionService.hasPermissionIn(perms, 'OPPORTUNITY_READ');
    const opportunityWhere = canReadOpportunities
      ? await getOpportunityVisibilityFilter(req.tenantId!, req.user!.id, 'read')
      : { id: { in: [] as string[] } };

    const leadScope = await getScopeClause(req.user!, 'lead');
    const taskScope = await getScopeClause(req.user!, 'task');

    const leadWhere: any = {
      tenantId: req.tenantId!,
      OR: [
        { leadNumber: { contains: searchTerm, mode: 'insensitive' } },
        { firstName: { contains: searchTerm, mode: 'insensitive' } },
        { lastName: { contains: searchTerm, mode: 'insensitive' } },
        { phone: { contains: searchTerm } },
      ],
    };
    if (leadScope) leadWhere.AND = [leadScope];

    const taskWhere: any = {
      tenantId: req.tenantId!,
      title: { contains: searchTerm, mode: 'insensitive' },
    };
    if (taskScope) taskWhere.AND = [taskScope];

    const [leads, opportunities, tasks] = await Promise.all([
      prisma.lead.findMany({
        where: leadWhere,
        select: { id: true, leadNumber: true, firstName: true, lastName: true, phone: true, status: true },
        take: numLimit,
      }),
      prisma.opportunity.findMany({
        where: {
          ...opportunityWhere,
          name: { contains: searchTerm, mode: 'insensitive' },
        },
        select: { id: true, name: true, stage: true, amount: true },
        take: numLimit,
      }),
      prisma.task.findMany({
        where: taskWhere,
        select: { id: true, title: true, status: true, priority: true },
        take: numLimit,
      }),
    ]);

    res.json({
      success: true,
      data: {
        leads: leads.map((l) => ({ ...l, type: 'lead', url: `/leads/${l.id}` })),
        opportunities: opportunities.map((o) => ({ ...o, type: 'opportunity', url: `/opportunities/${o.id}` })),
        tasks: tasks.map((t) => ({ ...t, type: 'task', url: `/tasks/${t.id}` })),
      },
    });
  } catch (error) {
    console.error('Quick search error:', error);
    res.status(500).json({ success: false, error: 'Quick search failed' });
  }
});

export { router as searchRoutes };