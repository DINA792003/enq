import { describe, expect, it } from 'vitest';
import { calculateQueueMatchScore, findApplicableRRQueue, hasLeadAssignmentRelevantChanges, selectNextSequenceMember } from './rrQueue';

describe('calculateQueueMatchScore', () => {
  it('favors the queue with the highest weighted match and source hierarchy', () => {
    const lead = {
      projectId: 'proj-1',
      projectName: 'Sameera Iris',
      status: 'NEW',
      priority: 'HOT',
      source: 'FACEBOOK',
      secondarySource: 'INSTAGRAM',
      tertiarySource: 'Campaign A',
    };

    const queueA = {
      leadStatus: ['NEW'],
      leadPriority: ['HOT'],
      leadSource: ['FACEBOOK'],
      secondarySource: ['INSTAGRAM'],
      tertiarySource: ['Campaign A'],
      projectInterested: ['Sameera Iris'],
    };

    const queueB = {
      leadStatus: ['NEW'],
      leadSource: ['FACEBOOK'],
      projectInterested: ['Sameera Iris'],
    };

    expect(calculateQueueMatchScore(queueA, lead)).toBeGreaterThan(calculateQueueMatchScore(queueB, lead));
    expect(calculateQueueMatchScore(queueA, lead)).toBe(1_111_110);
  });

  it('respects no-source fallback exclusions', () => {
    const lead = { status: 'NEW', source: 'INSTAGRAM', projectId: 'proj-1', projectName: 'Sameera Iris' };
    const queue = {
      leadStatus: ['NEW'],
      leadSource: ['FACEBOOK', 'GOOGLE', 'NO SOURCE'],
      excludeFromNoSource: ['INSTAGRAM'],
      projectInterested: ['Sameera Iris'],
    };

    expect(calculateQueueMatchScore(queue, lead)).toBe(990_010);
  });
});

describe('findApplicableRRQueue', () => {
  it('picks the best-scoring queue from a shortlist', async () => {
    const queues = [
      { id: 'q-1', createdAt: new Date('2024-01-01'), leadStatus: ['NEW'], leadSource: ['FACEBOOK'], projectInterested: ['Sameera Iris'] },
      { id: 'q-2', createdAt: new Date('2024-01-02'), leadStatus: ['NEW'], leadPriority: ['HOT'], leadSource: ['FACEBOOK'], projectInterested: ['Sameera Iris'] },
      { id: 'q-3', createdAt: new Date('2024-01-03'), leadStatus: ['NEW'], leadSource: ['FACEBOOK'], projectInterested: ['Other Project'] },
    ];

    const tx = {
      rRQueue: { findMany: async () => queues },
      project: { findFirst: async () => ({ name: 'Sameera Iris' }) },
    } as any;

    const result = await findApplicableRRQueue('tenant-1', { projectId: 'proj-1', status: 'NEW', source: 'FACEBOOK', priority: 'HOT' }, tx);
    expect(result?.id).toBe('q-2');
  });
});

describe('selectNextSequenceMember', () => {
  const members = [{ sequenceId: 1 }, { sequenceId: 2 }, { sequenceId: 3 }];

  it('assigns in sequence and wraps', () => {
    expect(selectNextSequenceMember(members, 0)?.sequenceId).toBe(1);
    expect(selectNextSequenceMember(members, 1)?.sequenceId).toBe(2);
    expect(selectNextSequenceMember(members, 2)?.sequenceId).toBe(3);
    expect(selectNextSequenceMember(members, 3)?.sequenceId).toBe(1);
  });

  describe('hasLeadAssignmentRelevantChanges', () => {
    it('only requests reassignment when assignment criteria changed', () => {
      expect(hasLeadAssignmentRelevantChanges({ lastName: 'Updated' })).toBe(false);
      expect(hasLeadAssignmentRelevantChanges({ status: 'PROSPECT' })).toBe(true);
      expect(hasLeadAssignmentRelevantChanges({ ownerId: null })).toBe(true);
      expect(hasLeadAssignmentRelevantChanges({ projectId: null })).toBe(true);
      expect(hasLeadAssignmentRelevantChanges({ source: 'WEBSITE' })).toBe(true);
    });
  });

  it('skips inactive members supplied by the caller', () => {
    const active = members.filter((member) => member.sequenceId !== 2);
    expect(selectNextSequenceMember(active, 1)?.sequenceId).toBe(3);
    expect(selectNextSequenceMember(active, 3)?.sequenceId).toBe(1);
  });

  it('does not select by lead count or random order', () => {
    const unordered = [{ sequenceId: 3 }, { sequenceId: 1 }, { sequenceId: 2 }];
    expect(selectNextSequenceMember(unordered, 1)?.sequenceId).toBe(2);
  });

  it('returns no member when every member is inactive', () => {
    expect(selectNextSequenceMember([], 2)).toBeNull();
  });

  it('continues from the next active sequence after a member is removed', () => {
    expect(selectNextSequenceMember([{ sequenceId: 1 }, { sequenceId: 3 }], 1)?.sequenceId).toBe(3);
    expect(selectNextSequenceMember([{ sequenceId: 1 }, { sequenceId: 3 }], 3)?.sequenceId).toBe(1);
  });
});
