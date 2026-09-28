import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { auditLog } from '../middleware/audit';
import {
  applyScope,
  canAccessLeadId,
  canAccessQuotation,
  getScopeClause,
} from '../services/recordAccess';

const router = Router();

router.use(authenticate);

const quotationItemSchema = z.object({
  unitId: z.string().optional(),
  description: z.string().min(1).max(500),
  quantity: z.number().int().min(1).default(1),
  unitPrice: z.number().min(0),
});

const quotationSchema = z.object({
  leadId: z.string().optional(),
  opportunityId: z.string().optional(),
  projectId: z.string().optional(),
  items: z.array(quotationItemSchema).min(1),
  validUntil: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
  taxAmount: z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
});

const updateQuotationSchema = quotationSchema.partial();

router.get('/', authorize('Quotation', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId } = req.user!;
    const {
      page = 1,
      limit = 20,
      opportunityId,
      leadId,
      projectId,
      status,
      minAmount,
      maxAmount,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    let where: any = { tenantId };
    if (opportunityId) where.opportunityId = opportunityId;
    if (leadId) where.leadId = leadId;
    if (projectId) where.projectId = projectId;
    if (status) where.status = status;
    if (minAmount) where.totalAmount = { ...where.totalAmount, gte: Number(minAmount) };
    if (maxAmount) where.totalAmount = { ...where.totalAmount, lte: Number(maxAmount) };
    where = applyScope(where, await getScopeClause(req.user!, 'quotation'));

    const [quotations, total] = await Promise.all([
      prisma.quotation.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
        include: {
          opportunity: { select: { id: true, name: true, stage: true } },
          lead: { select: { id: true, firstName: true, lastName: true } },
          project: { select: { id: true, name: true } },
          items: true,
          _count: { select: { bookings: true, approvals: true } },
        },
      }),
      prisma.quotation.count({ where }),
    ]);

    res.json({
      success: true,
      data: quotations,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get quotations error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch quotations' });
  }
});

router.get('/:id', authorize('Quotation', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId } = req.user!;

    const quotation = await prisma.quotation.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        opportunity: { select: { id: true, name: true, stage: true, amount: true } },
        lead: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        project: { select: { id: true, name: true } },
        items: { include: { unit: { select: { id: true, number: true } } } },
        bookings: { select: { id: true, number: true, status: true, bookingDate: true } },
        approvals: true,
      },
    });

    if (!quotation) {
      return res.status(404).json({ success: false, error: 'Quotation not found' });
    }

    if (!(await canAccessQuotation(req.user!, quotation))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this quotation' });
    }

    res.json({ success: true, data: quotation });
  } catch (error) {
    console.error('Get quotation error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch quotation' });
  }
});

router.post('/', authorize('Quotation', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const data = quotationSchema.parse(req.body);

    if (data.leadId && !(await canAccessLeadId(req.user!, data.leadId))) {
      return res.status(403).json({ success: false, error: 'You do not have access to the linked lead' });
    }

    const quotationNumber = `QT-${Date.now().toString(36).toUpperCase()}`;

    const items = data.items.map((item) => ({
      unitId: item.unitId,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.quantity * item.unitPrice,
    }));

    const totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0) + (data.taxAmount || 0) - (data.discount || 0);

    const quotation = await prisma.quotation.create({
      data: {
        tenantId,
        number: quotationNumber,
        leadId: data.leadId,
        opportunityId: data.opportunityId,
        projectId: data.projectId,
        status: 'DRAFT',
        totalAmount,
        taxAmount: data.taxAmount,
        discount: data.discount,
        validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
        notes: data.notes,
        items: { create: items },
      },
      include: {
        items: true,
        opportunity: { select: { id: true, name: true } },
      },
    });

    await auditLog(tenantId, userId, 'CREATE', 'Quotation', quotation.id, null, { number: quotationNumber, totalAmount, itemCount: items.length });

    res.status(201).json({ success: true, data: quotation });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Create quotation error:', error);
    res.status(500).json({ success: false, error: 'Failed to create quotation' });
  }
});

router.put('/:id', authorize('Quotation', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;

    const existing = await prisma.quotation.findFirst({
      where: { id: req.params.id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Quotation not found' });
    }

    if (!(await canAccessQuotation(req.user!, existing))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this quotation' });
    }

    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ success: false, error: 'Only draft quotations can be edited' });
    }

    const data = updateQuotationSchema.parse(req.body);

    const updateData: any = { ...data };
    if (data.validUntil) updateData.validUntil = new Date(data.validUntil);

    if (data.items) {
      await prisma.quotationItem.deleteMany({ where: { quotationId: req.params.id } });

      const items = data.items.map((item) => ({
        quotationId: req.params.id,
        unitId: item.unitId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.quantity * item.unitPrice,
      }));

      updateData.totalAmount = items.reduce((sum: number, item: any) => sum + item.totalPrice, 0) + (data.taxAmount || 0) - (data.discount || 0);
      updateData.items = { create: items };
    }

    const quotation = await prisma.quotation.update({
      where: { id: req.params.id },
      data: updateData,
      include: { items: true },
    });

    await auditLog(tenantId, userId, 'UPDATE', 'Quotation', quotation.id, existing, quotation);

    res.json({ success: true, data: quotation });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Update quotation error:', error);
    res.status(500).json({ success: false, error: 'Failed to update quotation' });
  }
});

router.patch('/:id/submit', authorize('Quotation', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;

    const existing = await prisma.quotation.findFirst({
      where: { id: req.params.id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Quotation not found' });
    }

    if (!(await canAccessQuotation(req.user!, existing))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this quotation' });
    }

    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ success: false, error: 'Only draft quotations can be submitted' });
    }

    const quotation = await prisma.quotation.update({
      where: { id: req.params.id },
      data: { status: 'SUBMITTED' },
    });

    await auditLog(tenantId, userId, 'UPDATE', 'Quotation', quotation.id, existing, { status: 'SUBMITTED' });

    res.json({ success: true, data: quotation });
  } catch (error) {
    console.error('Submit quotation error:', error);
    res.status(500).json({ success: false, error: 'Failed to submit quotation' });
  }
});

router.patch('/:id/approve', authorize('Quotation', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const { comments } = req.body;

    const existing = await prisma.quotation.findFirst({
      where: { id: req.params.id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Quotation not found' });
    }

    if (!(await canAccessQuotation(req.user!, existing))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this quotation' });
    }

    if (existing.status !== 'SUBMITTED') {
      return res.status(400).json({ success: false, error: 'Only submitted quotations can be approved' });
    }

    const [quotation] = await prisma.$transaction([
      prisma.quotation.update({
        where: { id: req.params.id },
        data: { status: 'APPROVED' },
      }),
      prisma.approval.create({
        data: {
          tenantId,
          quotationId: req.params.id,
          approverId: userId,
          status: 'APPROVED',
          comments,
        },
      }),
    ]);

    await auditLog(tenantId, userId, 'UPDATE', 'Quotation', quotation.id, existing, { status: 'APPROVED', comments });

    res.json({ success: true, data: quotation });
  } catch (error) {
    console.error('Approve quotation error:', error);
    res.status(500).json({ success: false, error: 'Failed to approve quotation' });
  }
});

router.patch('/:id/reject', authorize('Quotation', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const { comments } = req.body;

    const existing = await prisma.quotation.findFirst({
      where: { id: req.params.id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Quotation not found' });
    }

    if (!(await canAccessQuotation(req.user!, existing))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this quotation' });
    }

    if (existing.status !== 'SUBMITTED') {
      return res.status(400).json({ success: false, error: 'Only submitted quotations can be rejected' });
    }

    const [quotation] = await prisma.$transaction([
      prisma.quotation.update({
        where: { id: req.params.id },
        data: { status: 'REJECTED' },
      }),
      prisma.approval.create({
        data: {
          tenantId,
          quotationId: req.params.id,
          approverId: userId,
          status: 'REJECTED',
          comments,
        },
      }),
    ]);

    await auditLog(tenantId, userId, 'UPDATE', 'Quotation', quotation.id, existing, { status: 'REJECTED', comments });

    res.json({ success: true, data: quotation });
  } catch (error) {
    console.error('Reject quotation error:', error);
    res.status(500).json({ success: false, error: 'Failed to reject quotation' });
  }
});

router.delete('/:id', authorize('Quotation', 'delete'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;

    const existing = await prisma.quotation.findFirst({
      where: { id: req.params.id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Quotation not found' });
    }

    if (!(await canAccessQuotation(req.user!, existing))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this quotation' });
    }

    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ success: false, error: 'Only draft quotations can be deleted' });
    }

    await prisma.quotationItem.deleteMany({ where: { quotationId: req.params.id } });
    await prisma.quotation.delete({ where: { id: req.params.id } });

    await auditLog(tenantId, userId, 'DELETE', 'Quotation', existing.id, existing, null);

    res.json({ success: true, data: null });
  } catch (error) {
    console.error('Delete quotation error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete quotation' });
  }
});

export default router;
