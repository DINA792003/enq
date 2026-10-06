import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const searchParamState = { value: 'homepage=exec-1' };
  const routeState = { profileName: 'create' };
  const dragState: { onDragEnd: ((result: any) => void) | null } = { onDragEnd: null };
  const auth = {
    hasPermission: vi.fn().mockReturnValue(true),
    hasEffectivePermission: vi.fn().mockReturnValue(true),
    profile: { name: 'Admin' },
    roles: ['Admin'],
  };
  const router = { push: vi.fn(), replace: vi.fn() };

  const analyticsApi = {
    getLeads: vi.fn().mockResolvedValue({ data: { data: { total: 12 } } }),
    getOpportunities: vi.fn().mockResolvedValue({ data: { data: { total: 4 } } }),
    getPipeline: vi.fn().mockResolvedValue({ data: { data: { totalPipeline: 2500000, stages: [] } } }),
  };
  const taskApi = {
    list: vi.fn().mockResolvedValue({ data: { data: [] } }),
  };
  const activityApi = {
    list: vi.fn().mockResolvedValue({ data: { data: [] } }),
  };
  const opportunityApi = {
    list: vi.fn().mockResolvedValue({ data: { data: [] } }),
  };
  const profileApi = {
    list: vi.fn().mockResolvedValue({ data: { data: [{ id: 'profile-1', name: 'Admin' }] } }),
  };
  const reportApi = {
    list: vi.fn().mockResolvedValue({ data: { data: [] } }),
  };
  const homepageApi = {
    list: vi.fn().mockResolvedValue({ data: { data: [] } }),
    create: vi.fn().mockResolvedValue({
      data: { message: 'Home page created successfully', data: { id: 'standard-home' } },
    }),
    get: vi.fn().mockResolvedValue({
      data: { data: { name: 'Executive Dashboard', layout: [] } },
    }),
    update: vi.fn().mockResolvedValue({
      data: { message: 'Home page saved successfully', data: { id: 'standard-home' } },
    }),
    assigned: vi.fn().mockResolvedValue({
      data: { data: { name: 'Standard', layout: [] } },
    }),
  };

  return {
    searchParamState,
    routeState,
    dragState,
    auth,
    router,
    analyticsApi,
    opportunityApi,
    taskApi,
    activityApi,
    profileApi,
    reportApi,
    homepageApi,
  };
});

vi.mock('next/navigation', () => ({
  useParams: () => ({ profileName: mocks.routeState.profileName }),
  useRouter: () => mocks.router,
  useSearchParams: () => new URLSearchParams(mocks.searchParamState.value),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    user: { firstName: 'Admin', lastName: 'User' },
    profile: mocks.auth.profile,
    roles: mocks.auth.roles,
    isAdmin: true,
    isSuperAdmin: false,
    hasPermission: mocks.auth.hasPermission,
    hasEffectivePermission: mocks.auth.hasEffectivePermission,
  }),
}));

vi.mock('@/lib/api', () => ({
  analyticsApi: mocks.analyticsApi,
  opportunityApi: mocks.opportunityApi,
  taskApi: mocks.taskApi,
  activityApi: mocks.activityApi,
  profileApi: mocks.profileApi,
  reportApi: mocks.reportApi,
  homepageApi: mocks.homepageApi,
}));

vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode;
    onDragEnd?: (result: any) => void;
  }) => {
    mocks.dragState.onDragEnd = onDragEnd || null;
    return <>{children}</>;
  },
  Droppable: ({
    children,
  }: {
    children: (
      provided: {
        innerRef: (element: HTMLDivElement | null) => void;
        droppableProps: Record<string, unknown>;
        placeholder: null;
      },
      snapshot: { isDraggingOver: boolean },
    ) => React.ReactNode;
  }) =>
    children(
      { innerRef: () => undefined, droppableProps: {}, placeholder: null },
      { isDraggingOver: false },
    ),
  Draggable: ({
    children,
  }: {
    children: (
      provided: {
        innerRef: (element: HTMLDivElement | null) => void;
        draggableProps: { style: Record<string, unknown> };
        dragHandleProps: Record<string, unknown>;
      },
      snapshot: { isDropAnimating: boolean; isDragging: boolean },
    ) => React.ReactNode;
  }) =>
    children(
      { innerRef: () => undefined, draggableProps: { style: {} }, dragHandleProps: {} },
      { isDropAnimating: false, isDragging: false },
    ),
}));

vi.mock('react-rnd', () => ({
  Rnd: ({
    children,
    position,
  }: {
    children: React.ReactNode;
    position?: { x: number; y: number };
  }) => (
    <div data-layout-x={position?.x} data-layout-y={position?.y}>
      {children}
    </div>
  ),
}));

import HomePage from '../app/(dashboard)/home/page';
import ProfileLandingPage from '../app/(dashboard)/profiles/[profileName]/page';
import CustomizeProfileHomePage from '../app/(dashboard)/admin/customize-home/[profileName]/page';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function getContainer(): HTMLDivElement {
  if (!container) {
    throw new Error('Test container is not initialized');
  }
  return container;
}

describe('HomePage homepage selection', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.searchParamState.value = 'homepage=exec-1';
    mocks.routeState.profileName = 'create';
    mocks.dragState.onDragEnd = null;
    vi.clearAllMocks();
    mocks.auth.hasPermission.mockReturnValue(true);
    mocks.auth.hasEffectivePermission.mockReturnValue(true);
    mocks.auth.profile = { name: 'Admin' };
    mocks.auth.roles = ['Admin'];
    mocks.analyticsApi.getLeads.mockResolvedValue({ data: { data: { total: 12 } } });
    mocks.analyticsApi.getOpportunities.mockResolvedValue({ data: { data: { total: 4 } } });
    mocks.analyticsApi.getPipeline.mockResolvedValue({
      data: { data: { totalPipeline: 2500000, stages: [] } },
    });
    mocks.taskApi.list.mockResolvedValue({ data: { data: [] } });
    mocks.activityApi.list.mockResolvedValue({ data: { data: [] } });
    mocks.opportunityApi.list.mockResolvedValue({ data: { data: [] } });
    mocks.homepageApi.get.mockResolvedValue({
      data: { data: { name: 'Executive Dashboard', layout: [] } },
    });
    mocks.homepageApi.list.mockResolvedValue({ data: { data: [] } });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    container = null;
    root = null;
  });

  it('refetches dashboard data when the selected homepage changes', async () => {
    await act(async () => {
      root!.render(<HomePage />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.analyticsApi.getLeads).toHaveBeenCalledTimes(1);
    expect(mocks.homepageApi.get).toHaveBeenCalledWith('exec-1');
    expect(getContainer().textContent).toContain('Executive Dashboard');

    mocks.searchParamState.value = 'homepage=untitled-23';
    mocks.homepageApi.get.mockResolvedValue({
      data: { data: { name: 'Untitled Homepage23', layout: [] } },
    });

    await act(async () => {
      root!.render(<HomePage />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.analyticsApi.getLeads).toHaveBeenCalledTimes(2);
    expect(mocks.homepageApi.get).toHaveBeenLastCalledWith('untitled-23');
    expect(getContainer().textContent).toContain('Untitled Homepage23');
  });

  it('redirects non-admin users from an unassigned homepage to their own dashboard', async () => {
    mocks.auth.profile = { name: 'System Administrator' };
    mocks.auth.roles = ['System Administrator'];
    mocks.searchParamState.value = 'homepage=other-profile-home';
    mocks.homepageApi.assigned.mockResolvedValue({
      data: { data: { id: 'system-home', name: 'System Administrator Home', layout: ['total-leads'] } },
    });

    await act(async () => {
      root!.render(<HomePage />);
      await Promise.resolve();
    });

    expect(mocks.homepageApi.get).not.toHaveBeenCalled();
    expect(mocks.router.replace).toHaveBeenCalledWith('/home');
    expect(getContainer().textContent).toContain('System Administrator Home');
  });

  it('scales saved homepage widget widths across the available content area', async () => {
    mocks.homepageApi.get.mockResolvedValue({
      data: {
        data: {
          name: 'Executive Dashboard',
          layout: [{ id: 'total-leads', x: 0, y: 8, width: 558, height: 85 }],
        },
      },
    });

    await act(async () => {
      root!.render(<HomePage />);
      await Promise.resolve();
    });

    const fullWidthWidget = Array.from(getContainer().querySelectorAll('div[style]')).find(
      (element) => (element as HTMLElement).style.width === '50%',
    ) as HTMLElement | undefined;
    expect(fullWidthWidget?.style.left).toBe('0%');
  });

  it('loads the default CRM widget set for new dashboards', async () => {
    mocks.profileApi.list.mockResolvedValue({
      data: { data: [{ id: 'profile-1', name: 'Admin' }] },
    });

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(getContainer().textContent).toContain('Total Leads');
    expect(getContainer().textContent).toContain('Opportunities');
    expect(getContainer().textContent).toContain('Pipeline Value');
    expect(getContainer().textContent).toContain('Active Tasks');
    expect(getContainer().textContent).toContain('Recent Opportunities');
    expect(getContainer().textContent).toContain('Pipeline Summary');
    expect(getContainer().textContent).toContain('Upcoming Tasks');
    expect(getContainer().textContent).toContain('Recent Activity');
  });

  it('does not request or display task data when Task read permission is missing', async () => {
    mocks.auth.hasPermission.mockImplementation((objectName: string) => objectName !== 'Task');
    mocks.auth.hasEffectivePermission.mockReturnValue(false);

    await act(async () => {
      root!.render(<HomePage />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.taskApi.list).not.toHaveBeenCalled();
    expect(getContainer().textContent).not.toContain('Active Tasks');
    expect(getContainer().textContent).not.toContain('Upcoming Tasks');
  });

  it.each([
    ['standard-user', 'Standard User', 'profile-standard', 'homepage-standard'],
    ['system-administrator', 'System Administrator', 'profile-system-admin', 'homepage-system-admin'],
  ])('opens the existing homepage for %s', async (slug, profileName, profileId, homepageId) => {
    mocks.routeState.profileName = slug;
    mocks.profileApi.list.mockResolvedValue({
      data: { data: [{ id: profileId, name: profileName }] },
    });
    mocks.homepageApi.list.mockResolvedValue({
      data: {
        data: [{ id: homepageId, sharedProfiles: [{ profile: { id: profileId } }] }],
      },
    });

    await act(async () => {
      root!.render(<ProfileLandingPage />);
      await Promise.resolve();
    });

    const editLink = getContainer().querySelector('a[href*="/admin/customize-home/"]');
    expect(editLink?.getAttribute('href')).toBe(
      `/admin/customize-home/${homepageId}?profile=${encodeURIComponent(profileName)}`,
    );
  });

  it('shows the admin edit action on the Pre Sales dashboard page', async () => {
    mocks.routeState.profileName = 'pre-sales';
    mocks.profileApi.list.mockResolvedValue({
      data: { data: [{ id: 'profile-pre-sales', name: 'Pre Sales' }] },
    });
    mocks.homepageApi.list.mockResolvedValue({ data: { data: [] } });

    await act(async () => {
      root!.render(<ProfileLandingPage />);
      await Promise.resolve();
    });

    const editLink = Array.from(getContainer().querySelectorAll('a')).find(
      (link) => link.textContent?.includes('Edit') && link.getAttribute('href')?.includes('/admin/customize-home'),
    );
    expect(editLink).toBeTruthy();
    expect(editLink?.getAttribute('href')).toContain('/admin/customize-home/create?profile=');
  });

  it('shows the admin edit action on the Standard dashboard page', async () => {
    mocks.routeState.profileName = 'standard-user';
    mocks.profileApi.list.mockResolvedValue({
      data: { data: [{ id: 'profile-standard', name: 'Standard User' }] },
    });
    mocks.homepageApi.list.mockResolvedValue({ data: { data: [] } });

    await act(async () => {
      root!.render(<ProfileLandingPage />);
      await Promise.resolve();
    });

    const editLink = Array.from(getContainer().querySelectorAll('a')).find(
      (link) => link.textContent?.includes('Edit') && link.getAttribute('href')?.includes('/admin/customize-home'),
    );
    expect(editLink).toBeTruthy();
    expect(editLink?.getAttribute('href')).toContain('/admin/customize-home/create?profile=');
  });

  it('edits the selected profile homepage in place instead of retaining its test name', async () => {
    mocks.routeState.profileName = 'homepage-system-admin';
    mocks.searchParamState.value = 'profile=System%20Administrator';
    mocks.homepageApi.get.mockResolvedValue({
      data: { data: { name: 'test30', layout: [] } },
    });

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });

    expect(mocks.homepageApi.get).toHaveBeenCalledWith('homepage-system-admin');
    expect((getContainer().querySelector('input[aria-label="Homepage name"]') as HTMLInputElement).value)
      .toBe('System Administrator');
  });

  it('starts a new Standard homepage with the Standard name', async () => {
    mocks.routeState.profileName = 'create';
    mocks.searchParamState.value = 'profile=Standard';

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });

    expect((getContainer().querySelector('input[aria-label="Homepage name"]') as HTMLInputElement).value)
      .toBe('Standard');
  });

  it('saves a new Standard homepage after selecting a profile to share it with', async () => {
    mocks.routeState.profileName = 'create';
    mocks.searchParamState.value = 'profile=Standard';

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button')).find(
        (button) => button.textContent?.includes('Save and Share'),
      )?.click();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button')).find(
        (button) => button.textContent?.includes('Add Profile'),
      )?.click();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Add',
      )?.click();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Save',
      )?.click();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Save',
      )?.click();
      await Promise.resolve();
    });

    expect(mocks.homepageApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Standard', profileIds: ['profile-standard'] }),
    );
  });

  it('shows the selected dashboard components when Dashboard is clicked', async () => {
    mocks.routeState.profileName = 'selected-homepage';
    mocks.searchParamState.value = '';
    mocks.homepageApi.get.mockResolvedValue({
      data: { data: { name: 'Selected Dashboard', layout: ['total-leads'] } },
    });

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });

    expect(getContainer().querySelector('aside h2')?.textContent).toBe('Dashboard Components');
    expect(getContainer().textContent).toContain('Total Leads');

    await act(async () => {
      getContainer().querySelector<HTMLButtonElement>('button[aria-label="Reports"]')?.click();
    });
    expect(getContainer().textContent).not.toContain('Dashboard Components');
    expect(getContainer().textContent).toContain('No dashboard components found');

    await act(async () => {
      getContainer().querySelector<HTMLButtonElement>('button[aria-label="Dashboard"]')?.click();
    });
    expect(getContainer().textContent).toContain('Dashboard Components');
    expect(getContainer().textContent).toContain('Opportunities');
    expect(getContainer().textContent).not.toContain('No dashboard components found');
  });

  it('does not add a component when clicked and supports homepage options actions', async () => {
    mocks.routeState.profileName = 'create';
    mocks.searchParamState.value = 'profile=Standard';

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });

    await act(async () => {
      getContainer().querySelector<HTMLElement>('[aria-label="Add LEADS BY SOURCE to dashboard"]')?.click();
    });
    expect(getContainer().querySelector('[aria-label="Add LEADS BY SOURCE to dashboard"]')).toBeTruthy();
    expect(Array.from(getContainer().querySelectorAll('section h3')).some(
      (heading) => heading.textContent === 'LEADS BY SOURCE',
    )).toBe(false);

    await act(async () => {
      getContainer().querySelector<HTMLButtonElement>('button[aria-label="More homepage options"]')?.click();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button')).find(
        (button) => button.textContent?.includes('Remove all components'),
      )?.click();
    });
    expect(getContainer().textContent).toContain('Drag and drop a component');

    await act(async () => {
      getContainer().querySelector<HTMLButtonElement>('button[aria-label="More homepage options"]')?.click();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button')).find(
        (button) => button.textContent?.includes('Restore default components'),
      )?.click();
    });
    expect(getContainer().textContent).toContain('Total Leads');
    expect(getContainer().textContent).toContain('Recent Opportunities');
  });

  it('loads the requested reports as draggable Standard dashboard components', async () => {
    mocks.routeState.profileName = 'create';
    mocks.searchParamState.value = 'profile=Standard';
    mocks.profileApi.list.mockResolvedValue({
      data: { data: [{ id: 'profile-standard', name: 'Standard User' }] },
    });
    mocks.reportApi.list.mockResolvedValue({
      data: {
        data: {
          items: [
            { id: 'booking-report-id', name: 'Booking Reports', type: 'SUMMARY' },
            { id: 'lead-source-report-id', name: 'Lead by Source', type: 'SUMMARY' },
            { id: 'cmumldp6r00uc5z6amm8lvc2i', name: 'Lead by Status', type: 'SUMMARY' },
          ],
          pagination: { total: 3, totalPages: 1 },
        },
      },
    });

    await act(async () => {
      root!.render(<CustomizeProfileHomePage />);
      await Promise.resolve();
    });
    await act(async () => {
      getContainer().querySelector<HTMLButtonElement>('button[aria-label="Reports"]')?.click();
    });

    for (const reportName of ['Booking Reports', 'Lead by Source', 'Lead by Status']) {
      expect(
        getContainer().querySelector(`[aria-label="Add ${reportName} to dashboard"]`),
      ).toBeTruthy();
    }

    const reportRows = [
      { name: 'Booking Reports', id: 'booking-report-id', row: 9 },
      { name: 'Lead by Source', id: 'lead-source-report-id', row: 13 },
      { name: 'Lead by Status', id: 'cmumldp6r00uc5z6amm8lvc2i', row: 17 },
    ];
    const canvas = getContainer().querySelector<HTMLElement>('main .relative.w-full.overflow-hidden');
    expect(canvas).toBeTruthy();
    vi.spyOn(canvas!, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      right: 1200,
      bottom: 4000,
      width: 1100,
      height: 3900,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect);
    for (const report of reportRows) {
      const availableWidget = getContainer().querySelector<HTMLElement>(
        `[aria-label="Add ${report.name} to dashboard"]`,
      );
      expect(availableWidget).toBeTruthy();
      await act(async () => {
        availableWidget?.click();
      });
      expect(getContainer().querySelector(`[aria-label="Add ${report.name} to dashboard"]`)).toBeTruthy();
      expect(Array.from(getContainer().querySelectorAll('section h3')).some(
        (heading) => heading.textContent === report.name,
      )).toBe(false);

      await act(async () => {
        fireEvent.pointerMove(window, {
          clientX: 400,
          clientY: 100 + 8 + report.row * 124 + 20,
        });
        mocks.dragState.onDragEnd?.({
          draggableId: `report-${report.id}`,
          source: { droppableId: 'available', index: 0 },
          destination: { droppableId: 'canvas', index: 0 },
        });
      });
      const reportHeading = Array.from(getContainer().querySelectorAll('section h3')).find(
        (heading) => heading.textContent === report.name,
      );
      expect(reportHeading?.closest('section')?.parentElement?.getAttribute('data-layout-y'))
        .toBe(String(8 + report.row * 124));
    }
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button')).find(
        (button) => button.textContent?.includes('Save and Share'),
      )?.click();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button')).find(
        (button) => button.textContent?.includes('Add Profile'),
      )?.click();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Add',
      )?.click();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Save',
      )?.click();
    });
    await act(async () => {
      Array.from(getContainer().querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Save',
      )?.click();
      await Promise.resolve();
    });

    const savedWidgetIds = (mocks.homepageApi.create.mock.calls[0][0].layout as Array<{ id: string }>).map(
      (widget) => widget.id,
    );
    expect(savedWidgetIds).toEqual(expect.arrayContaining([
      'report-booking-report-id',
      'report-lead-source-report-id',
      'report-cmumldp6r00uc5z6amm8lvc2i',
    ]));
  });
});