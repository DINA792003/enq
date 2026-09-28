import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const searchParamState = { value: 'homepage=exec-1' };

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
    get: vi.fn().mockResolvedValue({
      data: { data: { name: 'Executive Dashboard', layout: [] } },
    }),
    assigned: vi.fn().mockResolvedValue({
      data: { data: { name: 'Standard', layout: [] } },
    }),
  };

  return {
    searchParamState,
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
  useParams: () => ({ profileName: 'create' }),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mocks.searchParamState.value),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    user: { firstName: 'Admin', lastName: 'User' },
    isAdmin: true,
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
  DragDropContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
  Rnd: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import HomePage from '../app/(dashboard)/home/page';
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
    vi.clearAllMocks();
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
});
