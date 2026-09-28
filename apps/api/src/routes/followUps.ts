import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { followUpSchema } from '@dct-crm/shared';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import {
  applyScope,
  canAccessFollowUp,
  canAccessLeadId,
  getScopeClause,
} from '../services/recordAccess';
import { promoteNewLeadOnFirstActivity } from '../services/leadWorkflowExtras';

const router = Router();

router.use(authenticate);

router.get('/', authorize('FollowUp', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, isCompleted, leadId, ownerId, search, sortBy = 'dueDate', sortOrder = 'asc' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    let where: any = { tenantId: req.tenantId! };
    if (isCompleted !== undefined) where.isCompleted = isCompleted === 'true';
    if (leadId) where.leadId = leadId;
    if (ownerId) where.ownerId = ownerId;
    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    where = applyScope(where, await getScopeClause(req.user!, 'followUp'));

    const [followUps, total] = await Promise.all([
      prisma.followUp.findMany({
        where,
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          lead: { select: { id: true, firstName: true, lastName: true, phone: true } },
        },
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
      }),
      prisma.followUp.count({ where }),
    ]);

    res.json({
      success: true,
      data: followUps,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get follow-ups error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch follow-ups' });
  }
});

router.get('/my', authorize('FollowUp', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, isCompleted, sortBy = 'dueDate', sortOrder = 'asc' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { tenantId: req.tenantId!, ownerId: req.user!.id };
    if (isCompleted !== undefined) where.isCompleted = isCompleted === 'true';

    const [followUps, total] = await Promise.all([
      prisma.followUp.findMany({
        where,
        include: {
          lead: { select: { id: true, firstName: true, lastName: true, phone: true } },
        },
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
      }),
      prisma.followUp.count({ where }),
    ]);

    res.json({
      success: true,
      data: followUps,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get my follow-ups error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch follow-ups' });
  }
});

router.get('/:id', authorize('FollowUp', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const followUp = await prisma.followUp.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
        lead: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
      },
    });

    if (!followUp) {
      return res.status(404).json({ success: false, error: 'Follow-up not found' });
    }

    if (!(await canAccessFollowUp(req.user!, followUp))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this follow-up' });
    }

    res.json({ success: true, data: followUp });
  } catch (error) {
    console.error('Get follow-up error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch follow-up' });
  }
});

router.post('/', authorize('FollowUp', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const data = followUpSchema.parse(req.body);

    if (data.leadId && !(await canAccessLeadId(req.user!, data.leadId))) {
      return res.status(403).json({ success: false, error: 'You do not have access to the linked lead' });
    }

    const followUp = await prisma.$transaction(async (tx) => {
      const created = await tx.followUp.create({
        data: {
          tenantId: req.tenantId!,
          ownerId: req.user!.id,
          title: data.title,
          description: data.description,
          dueDate: new Date(data.dueDate),
          leadId: data.leadId || undefined,
        },
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          lead: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      if (data.leadId) {
        await promoteNewLeadOnFirstActivity(tx, {
          tenantId: req.tenantId!,
          leadId: data.leadId,
          userId: req.user!.id,
          profileName: req.user!.profileName,
          activityLabel: 'Follow-up',
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId: req.tenantId!,
          userId: req.user!.id,
          leadId: data.leadId || undefined,
          action: 'FOLLOW_UP_CREATED',
          objectType: 'FollowUp',
          objectId: created.id,
          newValues: data,
        },
      });

      return created;
    });

    res.status(201).json({ success: true, data: followUp });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Create follow-up error:', error);
    res.status(500).json({ success: false, error: 'Failed to create follow-up' });
  }
});

router.put('/:id', authorize('FollowUp', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const existingFollowUp = await prisma.followUp.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!existingFollowUp) {
      return res.status(404).json({ success: false, error: 'Follow-up not found' });
    }

    if (!(await canAccessFollowUp(req.user!, existingFollowUp))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this follow-up' });
    }

    const data = followUpSchema.partial().parse(req.body);

    const updateData: any = { ...data };
    if (data.dueDate) updateData.dueDate = new Date(data.dueDate);

    const followUp = await prisma.followUp.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
        lead: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        leadId: existingFollowUp.leadId || undefined,
        action: 'UPDATE',
        objectType: 'FollowUp',
        objectId: followUp.id,
        oldValues: existingFollowUp,
        newValues: data,
      },
    });

    res.json({ success: true, data: followUp });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Update follow-up error:', error);
    res.status(500).json({ success: false, error: 'Failed to update follow-up' });
  }
});

router.delete('/:id', authorize('FollowUp', 'delete'), async (req: AuthRequest, res: Response) => {
  try {
    const followUp = await prisma.followUp.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!followUp) {
      return res.status(404).json({ success: false, error: 'Follow-up not found' });
    }

    if (!(await canAccessFollowUp(req.user!, followUp))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this follow-up' });
    }

    await prisma.followUp.delete({ where: { id: req.params.id } });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'DELETE',
        objectType: 'FollowUp',
        objectId: req.params.id,
        oldValues: followUp,
      },
    });

    res.json({ success: true, message: 'Follow-up deleted successfully' });
  } catch (error) {
    console.error('Delete follow-up error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete follow-up' });
  }
});

router.put('/:id/complete', authorize('FollowUp', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const followUp = await prisma.followUp.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!followUp) {
      return res.status(404).json({ success: false, error: 'Follow-up not found' });
    }

    if (!(await canAccessFollowUp(req.user!, followUp))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this follow-up' });
    }

    if (followUp.isCompleted) {
      return res.status(400).json({ success: false, error: 'Follow-up is already completed' });
    }

    const updatedFollowUp = await prisma.followUp.update({
      where: { id: req.params.id },
      data: { isCompleted: true, completedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        leadId: followUp.leadId || undefined,
        action: 'STATUS_CHANGE',
        objectType: 'FollowUp',
        objectId: followUp.id,
        oldValues: { isCompleted: false },
        newValues: { isCompleted: true },
      },
    });

    res.json({ success: true, data: updatedFollowUp });
  } catch (error) {
    console.error('Complete follow-up error:', error);
    res.status(500).json({ success: false, error: 'Failed to complete follow-up' });
  }
});

router.put('/:id/reopen', authorize('FollowUp', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const followUp = await prisma.followUp.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!followUp) {
      return res.status(404).json({ success: false, error: 'Follow-up not found' });
    }

    if (!(await canAccessFollowUp(req.user!, followUp))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this follow-up' });
    }

    if (!followUp.isCompleted) {
      return res.status(400).json({ success: false, error: 'Follow-up is not completed' });
    }

    const updatedFollowUp = await prisma.followUp.update({
      where: { id: req.params.id },
      data: { isCompleted: false, completedAt: null },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'STATUS_CHANGE',
        objectType: 'FollowUp',
        objectId: followUp.id,
        oldValues: { isCompleted: true },
        newValues: { isCompleted: false },
      },
    });

    res.json({ success: true, data: updatedFollowUp });
  } catch (error) {
    console.error('Reopen follow-up error:', error);
    res.status(500).json({ success: false, error: 'Failed to reopen follow-up' });
  }
});

export { router as followUpRoutes };
