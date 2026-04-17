import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RequestsService } from './requests.service';
import { RequestStatus } from '@prisma/client';

/**
 * Cross-user isolation & ownership scoping — non-negotiable green test (T32).
 *
 * User B must NOT be able to read, update, close, pause, resume, or recompute
 * user A's requests, nor read their matches or update A's match rows.
 */
describe('RequestsService — cross-user isolation', () => {
  const ownerId = 'user-A';
  const attackerId = 'user-B';
  const requestId = '11111111-1111-1111-1111-111111111111';

  const prismaMock = {
    propertyRequest: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    propertyMatch: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    propertyRequestLocation: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    property: { findUnique: jest.fn() },
    $transaction: jest.fn(async (arr: Promise<unknown>[]) => Promise.all(arr)),
  };

  const engineMock = {
    matchRequest: jest.fn().mockResolvedValue(0),
    matchProperty: jest.fn(),
    closeMatchesForProperty: jest.fn(),
  };

  const service = new RequestsService(prismaMock as any, engineMock as any);

  beforeEach(() => jest.clearAllMocks());

  it('findOne throws 403 when request belongs to another user', async () => {
    prismaMock.propertyRequest.findUnique.mockResolvedValue({
      id: requestId,
      userId: ownerId,
      status: RequestStatus.ACTIVE,
    });
    await expect(service.findOne(attackerId, requestId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('findOne throws 404 when request does not exist', async () => {
    prismaMock.propertyRequest.findUnique.mockResolvedValue(null);
    await expect(service.findOne(ownerId, requestId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('update throws 403 for non-owner', async () => {
    prismaMock.propertyRequest.findUnique.mockResolvedValue({
      id: requestId,
      userId: ownerId,
    });
    await expect(service.update(attackerId, requestId, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prismaMock.propertyRequest.update).not.toHaveBeenCalled();
  });

  it('remove/pause/resume all reject non-owner', async () => {
    prismaMock.propertyRequest.findUnique.mockResolvedValue({
      id: requestId,
      userId: ownerId,
    });
    await expect(service.remove(attackerId, requestId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.pause(attackerId, requestId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.resume(attackerId, requestId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('getMatches rejects non-owner before hitting match table', async () => {
    prismaMock.propertyRequest.findUnique.mockResolvedValue({
      id: requestId,
      userId: ownerId,
    });
    await expect(service.getMatches(attackerId, requestId, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prismaMock.propertyMatch.findMany).not.toHaveBeenCalled();
  });

  it('updateMatch rejects when match belongs to another user', async () => {
    prismaMock.propertyMatch.findUnique.mockResolvedValue({
      id: 'm1',
      request: { userId: ownerId },
    });
    await expect(
      service.updateMatch(attackerId, 'm1', { status: 'VIEWED' as any }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('recompute rejects non-owner', async () => {
    prismaMock.propertyRequest.findUnique.mockResolvedValue({
      id: requestId,
      userId: ownerId,
    });
    await expect(service.recompute(attackerId, requestId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(engineMock.matchRequest).not.toHaveBeenCalled();
  });

  it('interestedRequestsForProperty rejects non-owner seller', async () => {
    prismaMock.property.findUnique.mockResolvedValue({
      id: 'prop',
      userId: ownerId,
    });
    await expect(
      service.interestedRequestsForProperty(attackerId, 'prop'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('findAll scopes by userId (never returns other users rows)', async () => {
    prismaMock.propertyRequest.findMany.mockResolvedValue([]);
    prismaMock.propertyRequest.count.mockResolvedValue(0);
    await service.findAll(ownerId, {});
    expect(prismaMock.propertyRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: ownerId }) }),
    );
  });
});

describe('RequestsService — PII scrubbing', () => {
  const service = new RequestsService({} as any, {} as any);
  // access the private via bracket
  const scrub = (service as unknown as { scrubPii: (t: string | null) => string | null }).scrubPii.bind(service);

  it('redacts phone numbers', () => {
    expect(scrub('call me on +201234567890')).toContain('***');
    expect(scrub('call me on +201234567890')).not.toContain('201234567890');
  });
  it('redacts emails', () => {
    expect(scrub('email foo@bar.com please')).toContain('***');
  });
  it('passes null through', () => {
    expect(scrub(null)).toBe(null);
  });
});
