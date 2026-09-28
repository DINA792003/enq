"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Users, TrendingUp, Briefcase, FolderKanban, LayoutDashboard, FileText, CalendarCheck, Plus, ArrowRight } from "lucide-react";
import { analyticsApi, opportunityApi, taskApi, activityApi } from "@/lib/api";

const profileConfig: Record<string, { title: string; description: string; accent: string; modules: string[] }> = {
  marketing: {
    title: "Marketing",
    description: "Lead intake and follow-up pipeline for marketing-driven opportunities.",
    accent: "bg-blue-100 text-blue-700",
    modules: ["Leads", "Contacts", "Customers", "Campaign Follow-ups"],
  },
  presales: {
    title: "Presales",
    description: "Pre-sales qualification, discovery, and site-visit preparation.",
    accent: "bg-violet-100 text-violet-700",
    modules: ["Leads", "Site Visits", "Opportunities", "Reports"],
  },
  svc: {
    title: "SVC",
    description: "Site visit coordination and field activity readiness.",
    accent: "bg-emerald-100 text-emerald-700",
    modules: ["Site Visits", "Projects", "Tasks", "Reports"],
  },
  sales: {
    title: "Sales",
    description: "Revenue conversion, quotation tracking, and deal progression.",
    accent: "bg-amber-100 text-amber-700",
    modules: ["Opportunities", "Quotations", "Bookings", "Payments"],
  },
  crm: {
    title: "CRM",
    description: "Cross-functional lead operations and channel coordination.",
    accent: "bg-cyan-100 text-cyan-700",
    modules: ["Leads", "Accounts", "Customers", "Tasks"],
  },
  finance: {
    title: "Finance",
    description: "Revenue control, payment tracking, and financial review.",
    accent: "bg-emerald-100 text-emerald-700",
    modules: ["Payments", "Bookings", "Reports", "Quotations"],
  },
  recovery: {
    title: "Recovery",
    description: "Renewal recovery, lost-deal follow-up, and account re-engagement.",
    accent: "bg-rose-100 text-rose-700",
    modules: ["Leads", "Customers", "Tasks", "Reports"],
  },
  manager: {
    title: "Manager",
    description: "Performance visibility and high-level operational oversight.",
    accent: "bg-indigo-100 text-indigo-700",
    modules: ["Dashboard", "Leads", "Reports", "Projects"],
  },
  admin: {
    title: "Admin",
    description: "System configuration, profile control, and administrative access.",
    accent: "bg-slate-100 text-slate-700",
    modules: ["Users", "Profiles", "Permissions", "Settings"],
  },
  "crm-admin": {
    title: "CRM Admin",
    description: "CRM administration, governance, and operational support.",
    accent: "bg-slate-100 text-slate-700",
    modules: ["Users", "Profiles", "Permissions", "Settings"],
  },
};

function normalizeProfileKey(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-");
}

function getModuleIcon(module: string) {
  switch (module) {
    case "Leads":
      return Users;
    case "Reports":
      return FolderKanban;
    case "Tasks":
      return Briefcase;
    case "Dashboard":
      return LayoutDashboard;
    case "Payments":
      return TrendingUp;
    case "Site Visits":
      return CalendarCheck;
    case "Opportunities":
      return TrendingUp;
    case "Bookings":
      return FileText;
    default:
      return Users;
  }
}

const formatAmount = (amount: number) => {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${amount}`;
};

const formatTimeAgo = (value: string) => {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

export default function ProfileLandingPage() {
  const params = useParams<{ profileName: string }>();
  const [loading, setLoading] = React.useState(true);
  const [kpis, setKpis] = React.useState<any[]>([]);
  const [recentOpportunities, setRecentOpportunities] = React.useState<any[]>([]);
  const [pipelineStages, setPipelineStages] = React.useState<any[]>([]);
  const [upcomingTasks, setUpcomingTasks] = React.useState<any[]>([]);
  const [recentActivities, setRecentActivities] = React.useState<any[]>([]);

  const [localPage, setLocalPage] = React.useState({
    title: "",
    description: "",
  });

  React.useEffect(() => {
    const rawName = (params.profileName || "").replace(/-/g, " ");
    const key = normalizeProfileKey(rawName);
    const knownConfig = profileConfig[key] || profileConfig[params.profileName || ""];

    const defaultTitle = knownConfig?.title || rawName || "Profile";
    const defaultDescription = knownConfig?.description || "Profile overview and operational summary.";

    setLocalPage({
      title: defaultTitle,
      description: defaultDescription,
    });

    setLoading(false);
  }, [params.profileName]);

  React.useEffect(() => {
    let active = true;

    const fetchData = async () => {
      try {
        const [leadsRes, oppRes, pipelineRes, tasksRes, activitiesRes, recentOppRes] = await Promise.allSettled([
          analyticsApi.getLeads(),
          analyticsApi.getOpportunities(),
          analyticsApi.getPipeline(),
          taskApi.list({ limit: 3, sortBy: "dueDate", sortOrder: "asc" }),
          activityApi.list({ limit: 3 }),
          opportunityApi.list({ limit: 3, sortBy: "createdAt", sortOrder: "desc" }),
        ]);
        if (!active) return;

        const leadsData = leadsRes.status === "fulfilled" ? leadsRes.value.data?.data : null;
        const oppData = oppRes.status === "fulfilled" ? oppRes.value.data?.data : null;
        const pipelineData = pipelineRes.status === "fulfilled" ? pipelineRes.value.data?.data : null;
        const tasksData = tasksRes.status === "fulfilled" ? tasksRes.value.data?.data : [];
        const activitiesData = activitiesRes.status === "fulfilled" ? activitiesRes.value.data?.data : [];
        const recentOppData = recentOppRes.status === "fulfilled" ? recentOppRes.value.data?.data : [];

        setKpis([
          { label: "Total Leads", value: String(leadsData?.total ?? 0), icon: Users },
          { label: "Opportunities", value: String(oppData?.total ?? 0), icon: TrendingUp },
          { label: "Pipeline Value", value: formatAmount(pipelineData?.totalPipeline ?? 0), icon: TrendingUp },
          { label: "Active Tasks", value: String(Array.isArray(tasksData) ? tasksData.length : 0), icon: Briefcase },
        ]);

        if (Array.isArray(recentOppData)) setRecentOpportunities(recentOppData.slice(0, 3));
        if (Array.isArray(tasksData)) setUpcomingTasks(tasksData.slice(0, 3));
        if (Array.isArray(activitiesData)) setRecentActivities(activitiesData.slice(0, 3));
        if (Array.isArray(pipelineData?.stages)) {
          setPipelineStages(
            pipelineData.stages
              .filter((s: any) => !["CLOSED_WON", "CLOSED_LOST"].includes(s.stage))
              .slice(0, 4)
              .map((s: any) => ({ stage: s.stage, count: s.count, amount: s.amount ?? 0 })),
          );
        }
      } catch {
        if (active) {
          setKpis([]);
          setRecentOpportunities([]);
          setUpcomingTasks([]);
          setRecentActivities([]);
        }
      }
    };

    fetchData();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-3">
          <Skeleton className="h-64 xl:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/home" className="inline-flex items-center gap-2 hover:text-primary">
            <ArrowLeft className="h-4 w-4" />
            Home
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-5 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border bg-white text-xl font-bold text-slate-700 shadow-sm">
            {localPage.title.slice(0, 2).toUpperCase() || "PR"}
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Welcome {localPage.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{localPage.description}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/reports">View Reports</Link>
          </Button>
          <Button asChild>
            <Link href="/leads/new">
              <Plus className="mr-2 h-4 w-4" />
              New Lead
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
        <p>Here&apos;s what&apos;s happening today.</p>
        <div className="rounded-md border bg-white px-3 py-2 font-medium text-slate-700">
          {localPage.title}&apos;s Home
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.length === 0
          ? Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                <Skeleton className="h-4 w-24 mb-4" />
                <Skeleton className="h-8 w-20" />
              </div>
            ))
          : kpis.map((kpi) => {
              const Icon = kpi.icon || getModuleIcon(kpi.label);
              return (
                <div key={kpi.label} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">{kpi.label}</div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="mt-4 text-xl font-bold tracking-tight text-slate-800">
                    {kpi.value}
                  </div>
                </div>
              );
            })}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[16px] font-semibold tracking-tight">Recent Opportunities</h2>
              <Link href="/opportunities" className="inline-flex items-center gap-2 text-sm font-medium text-blue-600">
                View All <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="space-y-3">
              {recentOpportunities.length === 0 ? (
                <div className="flex min-h-[120px] items-center justify-center text-lg text-muted-foreground">
                  No recent opportunities
                </div>
              ) : (
                recentOpportunities.map((opp: any) => (
                  <Link
                    key={opp.id}
                    href={`/opportunities/${opp.id}`}
                    className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <div className="text-lg font-medium text-slate-800">{opp.name || "Untitled Opportunity"}</div>
                      <div className="text-sm uppercase tracking-wide text-muted-foreground">{opp.stage || "—"}</div>
                    </div>
                    <div className="text-right text-lg font-semibold text-slate-800">{formatAmount(opp.amount || 0)}</div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-4 text-[16px] font-semibold tracking-tight">Pipeline Summary</h2>
          <div className="space-y-4">
            {pipelineStages.length === 0 ? (
              <div className="flex min-h-[120px] items-center justify-center text-lg text-muted-foreground">
                No pipeline data
              </div>
            ) : (
              pipelineStages.map((stage) => (
                <div key={stage.stage} className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-slate-700">
                    <span className="capitalize">{stage.stage.toLowerCase().replace(/_/g, " ")}</span>
                    <span>{stage.count} • {formatAmount(stage.amount)}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-200">
                    <div
                      className="h-2.5 rounded-full bg-blue-500"
                      style={{ width: `${Math.min(100, Math.max(8, stage.count * 20))}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[16px] font-semibold tracking-tight">Upcoming Tasks</h2>
            <Link href="/tasks" className="text-sm font-medium text-blue-600">View All</Link>
          </div>
          {upcomingTasks.length === 0 ? (
            <div className="flex min-h-[170px] items-center justify-center text-xl text-muted-foreground">No upcoming tasks</div>
          ) : (
            <div className="space-y-3">
              {upcomingTasks.map((task: any) => (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-4 hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <div className="text-lg font-medium text-slate-800">{task.title || "Untitled Task"}</div>
                    <div className="text-sm uppercase tracking-wide text-muted-foreground">{task.status || "—"}</div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {task.dueDate ? new Date(task.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "No due date"}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[16px] font-semibold tracking-tight">Recent Activity</h2>
          </div>
          {recentActivities.length === 0 ? (
            <div className="flex min-h-[170px] items-center justify-center text-xl text-muted-foreground">No recent activity</div>
          ) : (
            <div className="space-y-3">
              {recentActivities.map((activity: any) => (
                <div key={activity.id} className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="text-sm font-medium text-slate-800">{activity.message || "Activity"}</div>
                  <div className="text-xs text-muted-foreground">
                    {activity.type || "Update"} • {activity.createdAt ? formatTimeAgo(activity.createdAt) : "Now"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
