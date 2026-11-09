jest.mock('@/lib/access-control', () => ({
  getAccessContext: jest.fn(),
}));

import { apiStationScope } from '@/lib/api-access';

function access(overrides: Record<string, unknown> = {}) {
  return {
    isAdmin: false,
    allowedStationIds: [],
    permissions: [],
    stationId: null,
    ...overrides,
  } as any;
}

describe('apiStationScope', () => {
  it('returns global scope for admins without active station', () => {
    expect(apiStationScope(access({ isAdmin: true }))).toEqual({});
  });

  it('returns active station for admins when valid', () => {
    expect(apiStationScope(access({ isAdmin: true, allowedStationIds: [1, 2] }), 2)).toEqual({ serviceStationId: 2 });
  });

  it('returns active station for normal users with permission', () => {
    expect(apiStationScope(access({ allowedStationIds: [1, 2] }), 2)).toEqual({ serviceStationId: 2 });
  });

  it('blocks station without permission', () => {
    expect(apiStationScope(access({ allowedStationIds: [1] }), 2)).toEqual({ serviceStationId: { in: [] } });
  });

  it('uses allowed stations when no active station', () => {
    expect(apiStationScope(access({ allowedStationIds: [3, 4] }))).toEqual({ serviceStationId: { in: [3, 4] } });
  });

  it('denies no allowed stations for non-admins', () => {
    expect(apiStationScope(access({ isAdmin: false, allowedStationIds: [] }))).toEqual({ serviceStationId: { in: [] } });
  });
});
