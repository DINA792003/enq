import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { authorize } from '../middleware/authorization';
import { auditLog } from '../middleware/audit';
import {
  applyScope,
  canAccessBooking,
  canAccessLeadId,
  getScopeClause,
} from '../services/recordAccess';

const router = Router();

router.use(authenticate);

const bookingSchema = z.object({
  leadId: z.string().optional(),
  opportunityId: z.string().optional(),
  quotationId: z.string().optional(),
  projectId: z.string(),
  unitId: z.string(),
  ownerId: z.string().optional(),
  queueId: z.string().optional(),
  number: z.string().optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED']).optional(),
  bookingDate: z.string().datetime().optional(),
  totalAmount: z.number().min(0),
  notes: z.string().max(2000).optional(),
});

const updateBookingSchema = bookingSchema.partial();

router.get('/', authorize('Booking', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId } = req.user!;
    const {
      page = 1,
      limit = 20,
      unitId,
      projectId,
      status,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    let where: any = { tenantId };
    if (unitId) where.unitId = unitId;
    if (projectId) where.projectId = projectId;
    if (status) where.status = status;
    if (startDate && endDate) {
      where.bookingDate = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string),
      };
    }
    where = applyScope(where, await getScopeClause(req.user!, 'booking'));

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { [sortBy as string]: sortOrder },
        include: {
          lead: { select: { id: true, firstName: true, lastName: true } },
          opportunity: { select: { id: true, name: true } },
          unit: { select: { id: true, number: true, type: true, area: true, price: true } },
          project: { select: { id: true, name: true } },
          owner: { select: { id: true, firstName: true, lastName: true } },
          payments: { select: { id: true, amount: true, status: true } },
        },
      }),
      prisma.booking.count({ where }),
    ]);

    res.json({
      success: true,
      data: bookings,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch bookings' });
  }
});

router.get('/:id', authorize('Booking', 'read'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId } = req.user!;

    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        lead: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        opportunity: { select: { id: true, name: true, stage: true } },
        unit: { select: { id: true, number: true } },
        project: { select: { id: true, name: true } },
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
        creator: { select: { id: true, firstName: true, lastName: true } },
        payments: { select: { id: true, amount: true, status: true, paymentDate: true } },
        activities: { take: 10, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    if (!(await canAccessBooking(req.user!, booking))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this booking' });
    }

    res.json({ success: true, data: booking });
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch booking' });
  }
});

router.post('/', authorize('Booking', 'create'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const data = bookingSchema.parse(req.body);

    if (data.leadId && !(await canAccessLeadId(req.user!, data.leadId))) {
      return res.status(403).json({ success: false, error: 'You do not have access to the linked lead' });
    }

    const bookingNumber = data.number || `BK-${Date.now().toString(36).toUpperCase()}`;

    const booking = await prisma.booking.create({
      data: {
        tenantId,
        leadId: data.leadId,
        opportunityId: data.opportunityId,
        quotationId: data.quotationId,
        projectId: data.projectId,
        unitId: data.unitId,
        ownerId: data.ownerId,
        creatorId: userId,
        queueId: data.queueId,
        number: bookingNumber,
        status: data.status || 'PENDING',
        bookingDate: data.bookingDate ? new Date(data.bookingDate) : new Date(),
        totalAmount: data.totalAmount,
        notes: data.notes,
      },
      include: {
        lead: { select: { id: true, firstName: true, lastName: true } },
        unit: { select: { id: true, number: true } },
        project: { select: { id: true, name: true } },
      },
    });

    await auditLog(tenantId, userId, 'CREATE', 'Booking', booking.id, null, { number: bookingNumber, unitId: data.unitId, totalAmount: data.totalAmount });

    res.status(201).json({ success: true, data: booking });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Create booking error:', error);
    res.status(500).json({ success: false, error: 'Failed to create booking' });
  }
});

router.put('/:id', authorize('Booking', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;

    const existing = await prisma.booking.findFirst({
      where: { id: req.params.id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    if (!(await canAccessBooking(req.user!, existing))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this booking' });
    }

    if (existing.status === 'CANCELLED' || existing.status === 'COMPLETED') {
      return res.status(400).json({ success: false, error: 'Cannot update cancelled or completed booking' });
    }

    const data = updateBookingSchema.parse(req.body);

    const updateData: any = { ...data };
    if (data.bookingDate) updateData.bookingDate = new Date(data.bookingDate);

    const booking = await prisma.booking.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        lead: { select: { id: true, firstName: true, lastName: true } },
        unit: { select: { id: true, number: true } },
      },
    });

    await auditLog(tenantId, userId, 'UPDATE', 'Booking', booking.id, existing, booking);

    res.json({ success: true, data: booking });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    console.error('Update booking error:', error);
    res.status(500).json({ success: false, error: 'Failed to update booking' });
  }
});

router.patch('/:id/confirm', authorize('Booking', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;

    const existing = await prisma.booking.findFirst({
      where: { id: req.params.id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    if (!(await canAccessBooking(req.user!, existing))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this booking' });
    }

    if (existing.status !== 'PENDING') {
      return res.status(400).json({ success: false, error: 'Only pending bookings can be confirmed' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.update({
        where: { id: req.params.id },
        data: { status: 'CONFIRMED' },
      });

      if (existing.leadId) {
        const lead = await tx.lead.findUnique({ where: { id: existing.leadId } });
        if (lead && lead.status === 'SITE_VISIT_HAPPENED') {
          await tx.lead.update({
            where: { id: existing.leadId },
            data: { status: 'BOOKED' },
          });

          await tx.auditLog.create({
            data: {
              tenantId,
              userId,
              leadId: existing.leadId,
              action: 'BOOKING_CONFIRMED',
              objectType: 'Lead',
              objectId: existing.leadId,
              oldValues: { status: 'SITE_VISIT_HAPPENED' },
              newValues: { status: 'BOOKED', bookingId: booking.id, reason: 'Booking confirmed' },
            },
          });
        }
      }

      await auditLog(tenantId, userId, 'UPDATE', 'Booking', booking.id, existing, { status: 'CONFIRMED' });

      return booking;
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Confirm booking error:', error);
    res.status(500).json({ success: false, error: 'Failed to confirm booking' });
  }
});

router.patch('/:id/cancel', authorize('Booking', 'edit'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;
    const { notes } = req.body;

    const existing = await prisma.booking.findFirst({
      where: { id: req.params.id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    if (!(await canAccessBooking(req.user!, existing))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this booking' });
    }

    if (existing.status === 'CANCELLED' || existing.status === 'COMPLETED') {
      return res.status(400).json({ success: false, error: 'Booking is already cancelled or completed' });
    }

    const booking = await prisma.booking.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED', notes: notes || existing.notes },
    });

    await auditLog(tenantId, userId, 'UPDATE', 'Booking', booking.id, existing, { status: 'CANCELLED', notes });

    res.json({ success: true, data: booking });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel booking' });
  }
});

router.delete('/:id', authorize('Booking', 'delete'), async (req: AuthRequest, res: Response) => {
  try {
    const { tenantId, id: userId } = req.user!;

    const existing = await prisma.booking.findFirst({
      where: { id: req.params.id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    if (!(await canAccessBooking(req.user!, existing))) {
      return res.status(403).json({ success: false, error: 'You do not have access to this booking' });
    }

    if (existing.status === 'CONFIRMED' || existing.status === 'COMPLETED') {
      return res.status(400).json({ success: false, error: 'Cannot delete confirmed or completed booking' });
    }

    await prisma.booking.delete({ where: { id: req.params.id } });

    await auditLog(tenantId, userId, 'DELETE', 'Booking', existing.id, existing, null);

    res.json({ success: true, data: null });
  } catch (error) {
    console.error('Delete booking error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete booking' });
  }
});

export default router;
