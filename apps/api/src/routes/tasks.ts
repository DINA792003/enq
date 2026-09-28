import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { taskSchema } from '@dct-crm/shared';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import {
  applyScope,
  canAccessLeadId,
  canAccessTask,
  getScopeClause,
} from '../services/recordAccess';
import { promoteNewLeadOnFirstActivity } from '../services/leadWorkflowExtras';

const router = Router();

router.use(authenticate);

router.get('/', authorize('Task', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, status, priority, ownerId, leadId, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    let where: any = { tenantId: req.tenantId! };
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (ownerId) where.ownerId = ownerId;
    if (leadId) where.leadId = leadId;
    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: 'insensitive' } },
        { description: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    where = applyScope(where, await getScopeClause(req.user!, 'task'));

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          lead: { select: { id: true, firstName: true, lastName: true, phone: true } },
          siteVisit: { select: { id: true, scheduledAt: true, status: true } },
          opportunity: { select: { id: true, name: true, stage: true } },
        },
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
      }),
      prisma.task.count({ where }),
    ]);

    res.json({
      success: true,
      data: tasks,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch tasks' });
  }
});

router.get('/my', authorize('Task', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, status, priority, sortBy = 'dueDate', sortOrder = 'asc' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { tenantId: req.tenantId!, ownerId: req.user!.id };
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          lead: { select: { id: true, firstName: true, lastName: true, phone: true } },
          opportunity: { select: { id: true, name: true, stage: true } },
        },
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
      }),
      prisma.task.count({ where }),
    ]);

    res.json({
      success: true,
      data: tasks,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get my tasks error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch tasks' });
  }
});

router.get('/:id', authorize('Task', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
        lead: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
        siteVisit: { select: { id: true, scheduledAt: true, status: true, notes: true } },
        opportunity: { select: { id: true, name: true, stage: true, amount: true } },
      },
    });

    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    if (!(await canAccessTask(req.user!, task))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this task' });
    }

    res.json({ success: true, data: task });
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch task' });
  }
});

router.post('/', authorize('Task', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const data = taskSchema.parse(req.body);

    if (data.leadId && !(await canAccessLeadId(req.user!, data.leadId))) {
      return res.status(403).json({ success: false, error: 'You do not have access to the linked lead' });
    }

    const task = await prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          tenantId: req.tenantId!,
          ownerId: req.user!.id,
          title: data.title,
          description: data.description,
          status: data.status || 'PENDING',
          priority: data.priority || 'MEDIUM',
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
          leadId: data.leadId || undefined,
          siteVisitId: data.siteVisitId || undefined,
          opportunityId: data.opportunityId || undefined,
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
          activityLabel: 'Task',
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId: req.tenantId!,
          userId: req.user!.id,
          leadId: data.leadId || undefined,
          action: 'TASK_CREATED',
          objectType: 'Task',
          objectId: created.id,
          newValues: data,
        },
      });

      return created;
    });

    res.status(201).json({ success: true, data: task });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Create task error:', error);
    res.status(500).json({ success: false, error: 'Failed to create task' });
  }
});

router.put('/:id', authorize('Task', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const existingTask = await prisma.task.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!existingTask) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    if (!(await canAccessTask(req.user!, existingTask))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this task' });
    }

    const data = taskSchema.partial().parse(req.body);

    const updateData: any = { ...data };
    if (data.dueDate) updateData.dueDate = new Date(data.dueDate);
    if (data.status === 'COMPLETED') updateData.completedAt = new Date();

    const task = await prisma.task.update({
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
        leadId: existingTask.leadId || undefined,
        action: 'TASK_UPDATED',
        objectType: 'Task',
        objectId: task.id,
        oldValues: existingTask,
        newValues: data,
      },
    });

    res.json({ success: true, data: task });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Update task error:', error);
    res.status(500).json({ success: false, error: 'Failed to update task' });
  }
});

router.delete('/:id', authorize('Task', 'delete'), async (req: AuthRequest, res: Response) => {
  try {
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    if (!(await canAccessTask(req.user!, task))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this task' });
    }

    await prisma.task.delete({ where: { id: req.params.id } });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'DELETE',
        objectType: 'Task',
        objectId: req.params.id,
        oldValues: task,
      },
    });

    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete task' });
  }
});

router.put('/:id/status', authorize('Task', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    if (!(await canAccessTask(req.user!, task))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this task' });
    }

    const updateData: any = { status };
    if (status === 'COMPLETED') updateData.completedAt = new Date();

    const updatedTask = await prisma.task.update({
      where: { id: req.params.id },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        leadId: task.leadId || undefined,
        action: status === 'COMPLETED' ? 'TASK_COMPLETED' : 'STATUS_CHANGE',
        objectType: 'Task',
        objectId: task.id,
        oldValues: { status: task.status },
        newValues: { status },
      },
    });

    res.json({ success: true, data: updatedTask });
  } catch (error) {
    console.error('Update task status error:', error);
    res.status(500).json({ success: false, error: 'Failed to update task status' });
  }
});

router.put('/:id/assign', authorize('Task', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { ownerId } = req.body;
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });

    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    if (!(await canAccessTask(req.user!, task))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this task' });
    }

    const updatedTask = await prisma.task.update({
      where: { id: req.params.id },
      data: { ownerId },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        leadId: task.leadId || undefined,
        action: 'ASSIGN',
        objectType: 'Task',
        objectId: task.id,
        oldValues: { ownerId: task.ownerId },
        newValues: { ownerId },
      },
    });

    res.json({ success: true, data: updatedTask });
  } catch (error) {
    console.error('Assign task error:', error);
    res.status(500).json({ success: false, error: 'Failed to assign task' });
  }
});

export { router as taskRoutes };
