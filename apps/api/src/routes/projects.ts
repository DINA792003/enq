import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@dct-crm/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { Response } from 'express';
import { authorize } from '../middleware/authorization';
import { auditLog } from '../middleware/audit';
import { PaginatedResponse } from '../types';
import { Prisma } from '@prisma/client';

const router = Router();

const projectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  address: z.string().min(1).max(500),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  zipCode: z.string().max(20).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  totalUnits: z.number().int().min(0).optional(),
});

const updateProjectSchema = projectSchema.partial();

function withLocationUrl<T extends { latitude: number | null; longitude: number | null }>(project: T) {
  return {
    ...project,
    locationUrl: project.latitude != null && project.longitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${project.latitude},${project.longitude}`
      : null,
  };
}

router.get('/', authenticate, authorize('Project', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId } = req.user!;
    const { page = 1, limit = 50, search, isActive, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    if (isActive !== undefined && isActive !== 'true' && isActive !== 'false') {
      return res.status(400).json({ success: false, error: 'Invalid project active filter' });
    }

    const skip = (Number(page) - 1) * Number(limit);

    const where: Prisma.ProjectWhereInput = {
      tenantId,
      ...(isActive !== undefined && { isActive: isActive === 'true' }),
      ...(search && {
        OR: [
          { name: { contains: search as string, mode: 'insensitive' } },
          { address: { contains: search as string, mode: 'insensitive' } },
          { city: { contains: search as string, mode: 'insensitive' } },
        ],
      }),
    };

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
        include: {
          _count: { select: { units: true, bookings: true, siteVisits: true } },
        },
      }),
      prisma.project.count({ where }),
    ]);

    const response: PaginatedResponse<typeof projects[0]> = {
      success: true,
      data: projects.map(withLocationUrl),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch projects' });
  }
});

router.get('/:id', authenticate, authorize('Project', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId } = req.user!;
    const { id } = req.params;

    const project = await prisma.project.findFirst({
      where: { id, tenantId },
      include: {
        units: { 
          select: { id: true, number: true, type: true, floor: true, price: true, status: true },
          orderBy: { floor: 'asc' },
        },
        _count: { select: { bookings: true, siteVisits: true } },
      },
    });

    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    res.json({ success: true, data: withLocationUrl(project) });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch project' });
  }
});

router.post('/', authenticate, authorize('Project', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const data = projectSchema.parse(req.body);

    const project = await prisma.project.create({
      data: {
        ...data,
        tenantId,
      },
    });

    await auditLog(tenantId, userId, 'CREATE', 'Project', project.id, null, { name: data.name, address: data.address });

    res.status(201).json({ success: true, data: withLocationUrl(project) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
    }
    res.status(500).json({ success: false, error: 'Failed to create project' });
  }
});

router.put('/:id', authenticate, authorize('Project', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const { id } = req.params;
    const data = updateProjectSchema.parse(req.body);

    const existing = await prisma.project.findFirst({ where: { id, tenantId } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const project = await prisma.project.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
    });

    await auditLog(tenantId, userId, 'UPDATE', 'Project', id, null, data);

    res.json({ success: true, data: withLocationUrl(project) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: error.errors });
    }
    res.status(500).json({ success: false, error: 'Failed to update project' });
  }
});

router.delete('/:id', authenticate, authorize('Project', 'delete'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const { id } = req.params;

    const existing = await prisma.project.findFirst({ where: { id, tenantId } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const hasUnits = await prisma.unit.count({ where: { projectId: id } });
    if (hasUnits > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot delete project with existing units. Remove all units first.' 
      });
    }

    await prisma.project.delete({ where: { id } });

    await auditLog(tenantId, userId, 'DELETE', 'Project', id, { name: existing.name, address: existing.address }, null);

    res.json({ success: true, data: null });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete project' });
  }
});

export default router;