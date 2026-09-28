import { Router, Response } from 'express';
import { prisma } from '@dct-crm/db';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticate);

function requireAdmin(req: AuthRequest, res: Response): boolean {
  if (req.user?.isSuperAdmin || req.user?.isAdmin) return true;
  res.status(403).json({ success: false, error: 'Admin access required' });
  return false;
}

async function getValidPoolTypes(tenantId: string): Promise<string[]> {
  const configs = await prisma.roundRobinConfig.findMany({
    where: { tenantId, isActive: true },
    select: { poolType: true },
  });
  return configs.map((c) => c.poolType);
}

const createConfigSchema = z.object({
  poolType: z.string().min(1).max(50).regex(/^[A-Z][A-Z0-9_-]*$/, 'Pool type must be uppercase alphanumeric with underscores/hyphens, starting with a letter'),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  profileName: z.string().min(1).max(100),
});

router.get('/configs', async (req: AuthRequest, res: Response) => {
  try {
    const configs = await prisma.roundRobinConfig.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: 'asc' },
    });

    return res.json({ success: true, data: configs });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/configs', async (req: AuthRequest, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;

    const data = createConfigSchema.parse(req.body);

    const existing = await prisma.roundRobinConfig.findUnique({
      where: { tenantId_poolType: { tenantId: req.tenantId!, poolType: data.poolType } },
    });
    if (existing) {
      if (!existing.isActive) {
        const updated = await prisma.roundRobinConfig.update({
          where: { id: existing.id },
          data: { isActive: true, name: data.name, description: data.description, profileName: data.profileName },
        });
        await prisma.auditLog.create({
          data: {
            tenantId: req.tenantId!,
            userId: req.user!.id,
            action: 'UPDATE',
            objectType: 'RoundRobinConfig',
            objectId: updated.id,
            newValues: { name: data.name, poolType: data.poolType, profileName: data.profileName },
          },
        });
        return res.json({ success: true, data: updated });
      }
      return res.status(409).json({ success: false, error: 'A Round Robin configuration with this pool type already exists' });
    }

    const profile = await prisma.profile.findFirst({
      where: { tenantId: req.tenantId!, name: data.profileName },
    });
    if (!profile) {
      return res.status(400).json({ success: false, error: `Profile "${data.profileName}" not found` });
    }

    const config = await prisma.roundRobinConfig.create({
      data: {
        tenantId: req.tenantId!,
        poolType: data.poolType,
        name: data.name,
        description: data.description || null,
        profileName: data.profileName,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'CREATE',
        objectType: 'RoundRobinConfig',
        objectId: config.id,
        newValues: { name: data.name, poolType: data.poolType, profileName: data.profileName },
      },
    });

    return res.json({ success: true, data: config });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/configs/:id', async (req: AuthRequest, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;

    const config = await prisma.roundRobinConfig.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
    });
    if (!config) {
      return res.status(404).json({ success: false, error: 'Configuration not found' });
    }

    const activeMembers = await prisma.roundRobinMember.count({
      where: { tenantId: req.tenantId!, poolType: config.poolType, isActive: true },
    });
    if (activeMembers > 0) {
      return res.status(400).json({ success: false, error: `Cannot delete: ${activeMembers} active member(s) in this pool. Remove them first.` });
    }

    await prisma.roundRobinConfig.update({
      where: { id: config.id },
      data: { isActive: false },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'DELETE',
        objectType: 'RoundRobinConfig',
        objectId: config.id,
        oldValues: { name: config.name, poolType: config.poolType },
      },
    });

    return res.json({ success: true, message: 'Configuration deleted' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:poolType', async (req: AuthRequest, res: Response) => {
  try {
    const { poolType } = req.params;
    const validTypes = await getValidPoolTypes(req.tenantId!);
    if (!validTypes.includes(poolType)) {
      return res.status(400).json({ success: false, error: 'Invalid pool type' });
    }

    const members = await prisma.roundRobinMember.findMany({
      where: { tenantId: req.tenantId!, poolType },
      include: {
        user: {
          select: {
            id: true, firstName: true, lastName: true, email: true, isActive: true,
            profile: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return res.json({ success: true, data: members });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const configs = await prisma.roundRobinConfig.findMany({
      where: { tenantId: req.tenantId!, isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    const members = await prisma.roundRobinMember.findMany({
      where: { tenantId: req.tenantId! },
      include: {
        user: {
          select: {
            id: true, firstName: true, lastName: true, email: true, isActive: true,
            profile: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const grouped: Record<string, any[]> = {};
    for (const config of configs) {
      grouped[config.poolType] = [];
    }
    for (const m of members) {
      if (!grouped[m.poolType]) grouped[m.poolType] = [];
      grouped[m.poolType].push(m);
    }

    return res.json({ success: true, data: grouped, configs });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { userId, poolType } = req.body;
    if (!userId || !poolType) {
      return res.status(400).json({ success: false, error: 'userId and poolType required' });
    }

    const validTypes = await getValidPoolTypes(req.tenantId!);
    if (!validTypes.includes(poolType)) {
      return res.status(400).json({ success: false, error: 'Invalid pool type' });
    }

    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId: req.tenantId!, isActive: true },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const existing = await prisma.roundRobinMember.findUnique({
      where: { tenantId_userId_poolType: { tenantId: req.tenantId!, userId, poolType } },
    });
    if (existing) {
      if (!existing.isActive) {
        const updated = await prisma.roundRobinMember.update({
          where: { id: existing.id },
          data: { isActive: true },
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true, profile: { select: { id: true, name: true } } } },
          },
        });
        return res.json({ success: true, data: updated });
      }
      return res.status(409).json({ success: false, error: 'User already in this Round Robin pool' });
    }

    const member = await prisma.roundRobinMember.create({
      data: { tenantId: req.tenantId!, userId, poolType },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true, profile: { select: { id: true, name: true } } } },
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'CREATE',
        objectType: 'RoundRobinMember',
        objectId: member.id,
        newValues: { userId, poolType, userName: `${user.firstName} ${user.lastName}` },
      },
    });

    return res.json({ success: true, data: member });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;

    const member = await prisma.roundRobinMember.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!member) {
      return res.status(404).json({ success: false, error: 'Member not found' });
    }

    await prisma.roundRobinMember.update({
      where: { id: member.id },
      data: { isActive: false },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: req.tenantId!,
        userId: req.user!.id,
        action: 'DELETE',
        objectType: 'RoundRobinMember',
        objectId: member.id,
        oldValues: { userId: member.userId, poolType: member.poolType, userName: `${member.user.firstName} ${member.user.lastName}` },
      },
    });

    return res.json({ success: true, message: 'Member removed from Round Robin' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/eligible/:poolType', async (req: AuthRequest, res: Response) => {
  try {
    const { poolType } = req.params;

    const config = await prisma.roundRobinConfig.findUnique({
      where: { tenantId_poolType: { tenantId: req.tenantId!, poolType } },
    });
    if (!config || !config.isActive) {
      return res.status(400).json({ success: false, error: 'Invalid pool type' });
    }

    const profile = await prisma.profile.findFirst({
      where: { tenantId: req.tenantId!, name: config.profileName },
    });

    if (!profile) {
      return res.json({ success: true, data: [] });
    }

    const existingMemberUserIds = await prisma.roundRobinMember.findMany({
      where: { tenantId: req.tenantId!, poolType, isActive: true },
      select: { userId: true },
    }).then((ms) => new Set(ms.map((m) => m.userId)));

    const eligibleUsers = await prisma.user.findMany({
      where: {
        tenantId: req.tenantId!,
        isActive: true,
        profileId: profile.id,
      },
      select: {
        id: true, firstName: true, lastName: true, email: true,
        profile: { select: { id: true, name: true } },
      },
      orderBy: { firstName: 'asc' },
    });

    const result = eligibleUsers.filter((u) => !existingMemberUserIds.has(u.id));

    return res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;