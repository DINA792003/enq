import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { getOpportunityVisibilityFilter } from '../services/recordAccess';
import { EffectivePermissionService } from '../services/effectivePermissions';

const router = Router();

router.use(authenticate);

const widgetSchema = z.object({
  id: z.string(),
  type: z.enum(['kpi', 'metric', 'chart', 'table', 'funnel', 'leaderboard', 'trend', 'gauge']),
  title: z.string(),
  metric: z.string().optional(),
  config: z.record(z.any()).optional(),
  position: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  }),
});

const dashboardSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  layout: z.array(widgetSchema),
  isDefault: z.boolean().optional(),
});

const updateDashboardSchema = dashboardSchema.partial();

router.get('/', authorize('Dashboard', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, isDefault, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { tenantId: req.tenantId! };
    if (isDefault !== undefined) where.isDefault = isDefault === 'true';
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [dashboards, total] = await Promise.all([
      prisma.dashboard.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
      }),
      prisma.dashboard.count({ where }),
    ]);

    res.json({
      success: true,
      data: dashboards,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get dashboards error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboards' });
  }
});

router.get('/default', authorize('Dashboard', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const dashboard = await prisma.dashboard.findFirst({
      where: { tenantId: req.tenantId!, isDefault: true },
    });

    if (!dashboard) {
      return res.status(404).json({ success: false, error: 'No default dashboard found' });
    }

    res.json({ success: true, data: dashboard });
  } catch (error) {
    console.error('Get default dashboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch default dashboard' });
  }
});

router.get('/:id', authorize('Dashboard', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const dashboard = await prisma.dashboard.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!dashboard) {
      return res.status(404).json({ success: false, error: 'Dashboard not found' });
    }

    res.json({ success: true, data: dashboard });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard' });
  }
});

router.post('/', authorize('Dashboard', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const data = dashboardSchema.parse(req.body);

    if (data.isDefault) {
      await prisma.dashboard.updateMany({
        where: { tenantId: req.tenantId!, isDefault: true },
        data: { isDefault: false },
      });
    }

    const dashboard = await prisma.dashboard.create({
      data: {
        tenantId: req.tenantId!,
        createdBy: req.user!.id,
        name: data.name,
        description: data.description,
        layout: data.layout,
        isDefault: data.isDefault || false,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'CREATE',
        objectType: 'Dashboard',
        objectId: dashboard.id,
        newValues: { name: data.name },
      },
    });

    res.status(201).json({ success: true, data: dashboard });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Create dashboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to create dashboard' });
  }
});

router.put('/:id', authorize('Dashboard', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const existingDashboard = await prisma.dashboard.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!existingDashboard) {
      return res.status(404).json({ success: false, error: 'Dashboard not found' });
    }

    const data = updateDashboardSchema.parse(req.body);

    if (data.isDefault) {
      await prisma.dashboard.updateMany({
        where: { tenantId: req.tenantId!, isDefault: true, id: { not: req.params.id } },
        data: { isDefault: false },
      });
    }

    const dashboard = await prisma.dashboard.update({
      where: { id: req.params.id },
      data,
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'UPDATE',
        objectType: 'Dashboard',
        objectId: dashboard.id,
        oldValues: existingDashboard,
        newValues: data,
      },
    });

    res.json({ success: true, data: dashboard });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Update dashboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to update dashboard' });
  }
});

router.delete('/:id', authorize('Dashboard', 'delete'), async (req: AuthRequest, res: Response) => {
  try {
    const dashboard = await prisma.dashboard.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!dashboard) {
      return res.status(404).json({ success: false, error: 'Dashboard not found' });
    }

    if (dashboard.isDefault) {
      return res.status(400).json({ success: false, error: 'Cannot delete default dashboard' });
    }

    await prisma.dashboard.delete({ where: { id: req.params.id } });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'DELETE',
        objectType: 'Dashboard',
        objectId: req.params.id,
        oldValues: dashboard,
      },
    });

    res.json({ success: true, message: 'Dashboard deleted successfully' });
  } catch (error) {
    console.error('Delete dashboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete dashboard' });
  }
});

router.post('/:id/widgets/:widgetId/data', authorize('Dashboard', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const dashboard = await prisma.dashboard.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!dashboard) {
      return res.status(404).json({ success: false, error: 'Dashboard not found' });
    }

    const layout = dashboard.layout as any[];
    const widget = layout.find((w: any) => w.id === req.params.widgetId);

    if (!widget) {
      return res.status(404).json({ success: false, error: 'Widget not found' });
    }

    const metricMap: Record<string, () => Promise<any>> = {
      totalLeads: async () => prisma.lead.count({ where: { tenantId: req.tenantId! } }),
      totalOpportunities: async () => {
        const perms = await EffectivePermissionService.getEffectivePermissionsCached(req.user!, req.user!.id);
        if (!EffectivePermissionService.hasPermissionIn(perms, 'OPPORTUNITY_READ')) return 0;
        return prisma.opportunity.count({ where: await getOpportunityVisibilityFilter(req.tenantId!, req.user!.id, 'read') });
      },
      totalBookings: async () => prisma.booking.count({ where: { tenantId: req.tenantId! } }),
      totalRevenue: async () => {
        const result = await prisma.payment.aggregate({
          where: { tenantId: req.tenantId!, status: 'COMPLETED' },
          _sum: { amount: true },
        });
        return result._sum.amount || 0;
      },
      leadsByStatus: async () => {
        const results = await prisma.lead.groupBy({
          by: ['status'],
          where: { tenantId: req.tenantId! },
          _count: { id: true },
        });
        return results.map((r) => ({ status: r.status, count: r._count.id }));
      },
      opportunitiesByStage: async () => {
        const [countByStage, amountByStage] = await Promise.all([
          prisma.opportunity.groupBy({
            by: ['stage'],
            where: await getOpportunityVisibilityFilter(req.tenantId!, req.user!.id, 'read'),
            _count: { id: true },
          }),
          prisma.opportunity.groupBy({
            by: ['stage'],
            where: { ...(await getOpportunityVisibilityFilter(req.tenantId!, req.user!.id, 'read')), amount: { not: null } },
            _sum: { amount: true },
          }),
        ]);
        const amountMap = new Map(amountByStage.map((r) => [r.stage, r._sum.amount || 0]));
        return countByStage.map((r) => ({
          stage: r.stage,
          count: r._count.id,
          amount: amountMap.get(r.stage) || 0,
        }));
      },
      recentActivities: async () =>
        prisma.activity.findMany({
          where: { tenantId: req.tenantId! },
          include: { user: { select: { firstName: true, lastName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      topOwners: async () => {
        const owners = await prisma.lead.groupBy({
          by: ['ownerId'],
          where: { tenantId: req.tenantId!, ownerId: { not: null } },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
          take: 10,
        });
        const ownerIds = owners.map((o) => o.ownerId!);
        const users = await prisma.user.findMany({
          where: { id: { in: ownerIds } },
          select: { id: true, firstName: true, lastName: true },
        });
        return owners.map((o) => ({
          ...o,
          user: users.find((u) => u.id === o.ownerId),
        }));
      },
    };

    const metric = widget.metric || widget.config?.metric;
    let data: any = null;

    if (metric && metricMap[metric]) {
      data = await metricMap[metric]();
    } else {
      data = { message: 'No data source configured for this widget' };
    }

    res.json({ success: true, data: { widget, data } });
  } catch (error) {
    console.error('Get widget data error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch widget data' });
  }
});

export { router as dashboardRoutes };