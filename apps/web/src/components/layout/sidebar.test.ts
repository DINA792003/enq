import { describe, expect, it } from 'vitest';
import { getNavigationByProfile } from './sidebar';

describe('getNavigationByProfile', () => {
  it('does not grant all CRM modules to an admin profile without matching effective permissions', () => {
    const nav = getNavigationByProfile('Sales Executive', [], () => false, false, true);

    expect(nav.some((item) => item.href === '/setup')).toBe(true);
    expect(nav.some((item) => item.href === '/leads')).toBe(false);
    expect(nav.some((item) => item.href === '/bookings')).toBe(false);
    expect(nav.some((item) => item.href === '/reports')).toBe(false);
  });

  it('grants module access only when the required effective permission exists', () => {
    const nav = getNavigationByProfile('Sales Executive', [], (perm) => perm === 'LEAD_READ' || perm === 'REPORT_VIEW', false, false);

    expect(nav.some((item) => item.href === '/leads')).toBe(true);
    expect(nav.some((item) => item.href === '/reports')).toBe(true);
    expect(nav.some((item) => item.href === '/opportunities')).toBe(false);
  });
});
