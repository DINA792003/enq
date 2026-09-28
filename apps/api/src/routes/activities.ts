import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { activitySchema } from '@dct-crm/shared';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import {
  applyScope,
  canAccessActivity,
  canAccessLeadId,
  getScopeClause,
} from '../services/recordAccess';
import { promoteNewLeadOnFirstActivity } from '../services/leadWorkflowExtras';

const router = Router();

router.use(authenticate);

router.get('/', authorize('Activity', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, type, leadId, siteVisitId, opportunityId, bookingId, userId, startDate, endDate, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    let where: any = { tenantId: req.tenantId! };
    if (type) where.type = type;
    if (leadId) where.leadId = leadId;
    if (siteVisitId) where.siteVisitId = siteVisitId;
    if (opportunityId) where.opportunityId = opportunityId;
    if (bookingId) where.bookingId = bookingId;
    if (userId) where.userId = userId;
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string),
      };
    }
    if (search) {
      where.OR = [
        { subject: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    where = applyScope(where, await getScopeClause(req.user!, 'activity'));

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
          lead: { select: { id: true, firstName: true, lastName: true, phone: true } },
          siteVisit: { select: { id: true, scheduledAt: true, status: true } },
          opportunity: { select: { id: true, name: true, stage: true } },
          booking: { select: { id: true, number: true, status: true } },
        },
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
      }),
      prisma.activity.count({ where }),
    ]);

    res.json({
      success: true,
      data: activities,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get activities error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch activities' });
  }
});

router.get('/:id', authorize('Activity', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const activity = await prisma.activity.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        lead: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
        siteVisit: { select: { id: true, scheduledAt: true, status: true, notes: true } },
        opportunity: { select: { id: true, name: true, stage: true, amount: true } },
        booking: { select: { id: true, number: true, status: true, totalAmount: true } },
      },
    });

    if (!activity) {
      return res.status(404).json({ success: false, error: 'Activity not found' });
    }

    if (!(await canAccessActivity(req.user!, activity))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this activity' });
    }

    res.json({ success: true, data: activity });
  } catch (error) {
    console.error('Get activity error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch activity' });
  }
});

router.post('/', authorize('Activity', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const data = activitySchema.parse(req.body);

    if (data.leadId && !(await canAccessLeadId(req.user!, data.leadId))) {
      return res.status(403).json({ success: false, error: 'You do not have access to the linked lead' });
    }

    if (data.type === 'NOTE' && (!data.description || !data.description.trim())) {
      return res.status(400).json({ success: false, error: 'Note content is required' });
    }

    const activity = await prisma.$transaction(async (tx) => {
      const created = await tx.activity.create({
        data: {
          tenantId: req.tenantId!,
          userId: req.user!.id,
          type: data.type,
          subject: data.subject,
          description: data.description,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
          leadId: data.leadId || undefined,
          siteVisitId: data.siteVisitId || undefined,
          opportunityId: data.opportunityId || undefined,
          bookingId: data.bookingId || undefined,
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
          lead: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      if (data.leadId) {
        await promoteNewLeadOnFirstActivity(tx, {
          tenantId: req.tenantId!,
          leadId: data.leadId,
          userId: req.user!.id,
          profileName: req.user!.profileName,
          activityLabel: data.type === 'NOTE' ? 'Note' : `Activity (${data.type})`,
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId: req.tenantId!,
          userId: req.user!.id,
          leadId: data.leadId || undefined,
          action: data.type === 'NOTE' ? 'NOTE_CREATED' : 'CREATE',
          objectType: 'Activity',
          objectId: created.id,
          newValues: data,
        },
      });

      return created;
    });

    res.status(201).json({ success: true, data: activity });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Create activity error:', error);
    res.status(500).json({ success: false, error: 'Failed to create activity' });
  }
});

router.put('/:id', authorize('Activity', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const existingActivity = await prisma.activity.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!existingActivity) {
      return res.status(404).json({ success: false, error: 'Activity not found' });
    }

    if (!(await canAccessActivity(req.user!, existingActivity))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this activity' });
    }

    const data = activitySchema.partial().parse(req.body);

    const updateData: any = { ...data };
    if (data.dueDate) updateData.dueDate = new Date(data.dueDate);

    const activity = await prisma.activity.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        lead: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        leadId: existingActivity.leadId || undefined,
        action: 'UPDATE',
        objectType: 'Activity',
        objectId: activity.id,
        oldValues: existingActivity,
        newValues: data,
      },
    });

    res.json({ success: true, data: activity });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Update activity error:', error);
    res.status(500).json({ success: false, error: 'Failed to update activity' });
  }
});

router.delete('/:id', authorize('Activity', 'delete'), async (req: AuthRequest, res: Response) => {
  try {
    const activity = await prisma.activity.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!activity) {
      return res.status(404).json({ success: false, error: 'Activity not found' });
    }

    if (!(await canAccessActivity(req.user!, activity))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this activity' });
    }

    await prisma.activity.delete({ where: { id: req.params.id } });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        leadId: activity.leadId || undefined,
        action: 'DELETE',
        objectType: 'Activity',
        objectId: req.params.id,
        oldValues: activity,
      },
    });

    res.json({ success: true, message: 'Activity deleted successfully' });
  } catch (error) {
    console.error('Delete activity error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete activity' });
  }
});

router.put('/:id/complete', authorize('Activity', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const activity = await prisma.activity.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!activity) {
      return res.status(404).json({ success: false, error: 'Activity not found' });
    }

    if (!(await canAccessActivity(req.user!, activity))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this activity' });
    }

    const updatedActivity = await prisma.activity.update({
      where: { id: req.params.id },
      data: { completedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        leadId: activity.leadId || undefined,
        action: 'STATUS_CHANGE',
        objectType: 'Activity',
        objectId: activity.id,
        oldValues: { completedAt: activity.completedAt },
        newValues: { completedAt: new Date() },
      },
    });

    res.json({ success: true, data: updatedActivity });
  } catch (error) {
    console.error('Complete activity error:', error);
    res.status(500).json({ success: false, error: 'Failed to complete activity' });
  }
});

export { router as activityRoutes };
