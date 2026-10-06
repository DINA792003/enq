import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@dct-crm/db';

vi.mock('@dct-crm/db', () => ({
  prisma: {
    rRQueue: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() },
    rRQueueMember: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    rRQueueHistory: { createMany: vi.fn() },
    user: { findFirst: vi.fn() },
    sequence: { upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'admin-1', tenantId: 'tenant-1', isAdmin: true, isSuperAdmin: false };
    req.tenantId = 'tenant-1';
    next();
  },
}));

import rrQueuesRouter from './rrQueues';

const servers: Array<ReturnType<ReturnType<typeof express>['listen']>> = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  servers.length = 0;
});

beforeEach(() => { vi.clearAllMocks(); });

async function request(method: string, path: string, body?: unknown) {
  const app = express();
  app.use(express.json());
  app.use('/api/rrqueues', rrQueuesRouter);
  const server = app.listen(0);
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  return fetch(`http://127.0.0.1:${address.port}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('RRQueue API validation', () => {
  it('rejects an empty queue name', async () => {
    const response = await request('POST', '/api/rrqueues', { name: '' });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ success: false, error: 'Complete this field.' });
  });

  it('rejects a missing member user', async () => {
    const response = await request('POST', '/api/rrqueues/queue-1/members', {});
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ success: false, error: 'User is required.' });
  });

  it('creates a queue with lead count and previous member ID', async () => {
    vi.mocked(prisma.rRQueue.create).mockResolvedValue({ id: 'queue-1', leadCount: 3, previousId: 2 } as any);

    const response = await request('POST', '/api/rrqueues', {
      name: 'New Queue',
      leadStatus: ['NEW'],
      projectInterested: ['project-1'],
      excludeFromNoSource: ['WEBSITE'],
      ownerId: 'owner-1',
      leadCount: 3,
      previousId: 2,
    });

    expect(response.status).toBe(201);
    expect(prisma.rRQueue.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        leadCount: 3,
        previousId: 2,
        projectInterested: ['project-1'],
        excludeFromNoSource: ['WEBSITE'],
        ownerId: 'owner-1',
      }),
    }));
  });

  it('updates queue lead count and previous member ID', async () => {
    vi.mocked(prisma.rRQueue.updateMany).mockResolvedValue({ count: 1 } as any);
    vi.mocked(prisma.rRQueue.findUnique).mockResolvedValue({ id: 'queue-1', leadCount: 4, previousId: 2 } as any);

    const response = await request('PUT', '/api/rrqueues/queue-1', { leadCount: 4, previousId: 2 });

    expect(response.status).toBe(200);
    expect(prisma.rRQueue.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'queue-1', tenantId: 'tenant-1' },
      data: { leadCount: 4, previousId: 2, updatedById: 'admin-1' },
    }));
  });

  it('updates the member external user ID', async () => {
    const member = { id: 'member-1', name: 'UID-4328', rrQueueId: 'queue-1', tenantId: 'tenant-1', userId: 'user-1', userIdNumber: '0', activeMember: true, user: { id: 'user-1', firstName: 'Sneha', lastName: 'S' } };
    const updateMember = vi.fn().mockResolvedValue({ ...member, userIdNumber: '1' });
    const history = vi.fn();
    vi.mocked(prisma.$transaction).mockImplementation(((callback: any) => callback({
      rRQueueMember: { findFirst: vi.fn().mockResolvedValue(member), update: updateMember },
      user: { findFirst: vi.fn().mockResolvedValue({ firstName: 'Admin', lastName: 'User' }) },
      rRQueueHistory: { createMany: history },
    })) as any);

    const response = await request('PUT', '/api/rrqueues/queue-1/members/member-1', { userIdNumber: '1' });

    expect(response.status).toBe(200);
    expect(updateMember).toHaveBeenCalledWith(expect.objectContaining({
      data: { userIdNumber: '1' },
    }));
    expect(history).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ field: 'UID-4328 - user id', originalValue: '0', newValue: '1' })] }));
  });

  it('updates the member user lookup', async () => {
    const member = { id: 'member-1', name: 'UID-4328', rrQueueId: 'queue-1', tenantId: 'tenant-1', userId: 'user-1', activeMember: true, user: { id: 'user-1', firstName: 'Sneha', lastName: 'S' } };
    const updateMember = vi.fn().mockResolvedValue({ ...member, userId: 'user-2' });
    const history = vi.fn();
    const findUser = vi.fn().mockResolvedValueOnce({ id: 'user-2', firstName: 'New', lastName: 'User' }).mockResolvedValueOnce({ firstName: 'Admin', lastName: 'User' });
    vi.mocked(prisma.$transaction).mockImplementation(((callback: any) => callback({
      rRQueueMember: { findFirst: vi.fn().mockResolvedValue(member), update: updateMember },
      user: { findFirst: findUser },
      rRQueueHistory: { createMany: history },
    })) as any);

    const response = await request('PUT', '/api/rrqueues/queue-1/members/member-1', { userId: 'user-2' });

    expect(response.status).toBe(200);
    expect(findUser).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-2', tenantId: 'tenant-1', isActive: true },
    }));
    expect(updateMember).toHaveBeenCalledWith(expect.objectContaining({
      data: { userId: 'user-2' },
    }));
    expect(history).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ field: 'UID-4328 - User', originalValue: 'Sneha S', newValue: 'New User' })] }));
  });

  it('accepts an empty external employee ID as null', async () => {
    const createdMember = {
      id: 'member-1',
      name: 'UID-0001',
      userIdNumber: null,
      user: { id: 'user-1', firstName: 'Sneha', lastName: 'S', email: 'sneha@example.com', isActive: true },
      activeMember: true,
    };
    const transaction = {
      rRQueue: { findFirst: vi.fn().mockResolvedValue({ id: 'queue-1' }), update: vi.fn() },
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'user-1' }) },
      rRQueueMember: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(createdMember),
      },
      sequence: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({ nextValue: 2 }) },
      rRQueueHistory: { createMany: vi.fn() },
    };
    vi.mocked(prisma.$transaction).mockImplementation(((callback: any) => callback(transaction)) as any);

    const response = await request('POST', '/api/rrqueues/queue-1/members', { userId: 'user-1', userIdNumber: '' });

    expect(response.status).toBe(201);
    expect(transaction.rRQueueMember.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: 'UID-0001', userIdNumber: null, userId: 'user-1' }),
    }));
    await expect(response.json()).resolves.toMatchObject({ success: true, data: { name: 'UID-0001' } });
  });

  it('creates a member with an auto-numbered name and numeric user ID', async () => {
    const createdMember = {
      id: 'member-1',
      name: 'UID-0001',
      userIdNumber: '1',
      user: { id: 'user-1', firstName: 'Sneha', lastName: 'S', email: 'sneha@example.com', isActive: true },
      activeMember: true,
    };
    const transaction = {
      rRQueue: { findFirst: vi.fn().mockResolvedValue({ id: 'queue-1' }), update: vi.fn() },
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'user-1' }) },
      rRQueueMember: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(createdMember),
      },
      sequence: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({ nextValue: 2 }) },
      rRQueueHistory: { createMany: vi.fn() },
    };
    vi.mocked(prisma.$transaction).mockImplementation(((callback: any) => callback(transaction)) as any);

    const response = await request('POST', '/api/rrqueues/queue-1/members', { userId: 'user-1', userIdNumber: '1' });

    expect(response.status).toBe(201);
    expect(transaction.rRQueueMember.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: 'UID-0001', userIdNumber: '1', userId: 'user-1' }),
    }));
    expect(transaction.rRQueueHistory.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ field: 'Created.', newValue: 'UID-0001 (Sneha S)' })],
    }));
    await expect(response.json()).resolves.toMatchObject({ success: true, data: { name: 'UID-0001' } });
  });

  it('permanently deletes an active member and updates the queue count', async () => {
    const member = {
      id: 'member-1',
      rrQueueId: 'queue-1',
      tenantId: 'tenant-1',
      activeMember: true,
      user: { isActive: true },
    };
    const deleteMember = vi.fn().mockResolvedValue(member);
    const updateQueue = vi.fn().mockResolvedValue({});
    const history = vi.fn();
    vi.mocked(prisma.$transaction).mockImplementation(((callback: any) => callback({
      rRQueueMember: { findFirst: vi.fn().mockResolvedValue({ ...member, name: 'UID-4328', user: { firstName: 'Sneha', lastName: 'S', isActive: true } }), delete: deleteMember },
      rRQueue: { update: updateQueue },
      user: { findFirst: vi.fn().mockResolvedValue({ firstName: 'Admin', lastName: 'User' }) },
      rRQueueHistory: { createMany: history },
    })) as any);

    const response = await request('DELETE', '/api/rrqueues/queue-1/members/member-1');

    expect(response.status).toBe(200);
    expect(deleteMember).toHaveBeenCalledWith({ where: { id: 'member-1' } });
    expect(updateQueue).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'queue-1' },
      data: { noOfUsers: { decrement: 1 } },
    }));
    expect(history).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ field: 'Deleted.', originalValue: 'UID-4328 (Sneha S)' })] }));
  });
});
