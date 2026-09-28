"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DragStart,
  type DragUpdate,
  type DropResult,
} from "@hello-pangea/dnd";
import { Rnd } from "react-rnd";
import {
  ArrowLeft,
  BarChart3,
  Check,
  GripVertical,
  LayoutDashboard,
  Loader2,
  MoreHorizontal,
  Save,
  Search,
  Blocks,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { homepageApi, profileApi, reportApi } from "@/lib/api";

interface Widget {
  id: string;
  title: string;
  description: string;
  value: string;
  type: "kpi" | "list" | "summary";
  category: "Org Overview" | "Activity Stats" | "Reports";
}
interface ReportWidgetRow {
  id: string;
  name: string;
  description?: string | null;
  type?: string;
  objectName?: string;
  columns?: string[];
  filters?: unknown;
  filterLogic?: "AND" | "OR";
  aggregates?: unknown;
  groupBy?: string | null;
  groupColumn?: string | null;
  rowGroups?: string[];
  columnGroups?: string[];
  crossFilter?: unknown;
  sortBy?: string | null;
  sortOrder?: string | null;
  createdBy?: string;
  createdAt?: string;
  folder?: { name: string } | null;
}
interface ReportResult {
  columns: string[];
  columnTypes?: Record<string, string>;
  totalRows: number;
  rows: Record<string, unknown>[];
}
interface Profile {
  id: string;
  name: string;
}
interface WidgetLayout {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
interface WidgetSize {
  columns: number;
  rows: number;
}

const GRID_SIZE = 16;
const CELL_WIDTH = 85;
const CELL_HEIGHT = 116;
const CELL_GAP = 8;
const CELL_ORIGIN = 8;
const MIN_WIDGET_WIDTH = CELL_WIDTH;
const MIN_WIDGET_HEIGHT = CELL_HEIGHT;
const GRID_SLOT_WIDTH = CELL_WIDTH + CELL_GAP;
const GRID_SLOT_HEIGHT = CELL_HEIGHT + CELL_GAP;
const GRID_COLUMNS = 12;
const GRID_ROWS = 8;

const widgetSizes: Record<string, WidgetSize> = {
  "total-leads": { columns: 3, rows: 1 },
  opportunities: { columns: 3, rows: 1 },
  "pipeline-value": { columns: 3, rows: 1 },
  "active-tasks": { columns: 3, rows: 1 },
  "recent-opportunities": { columns: 8, rows: 4 },
  "pipeline-summary": { columns: 4, rows: 4 },
  "upcoming-tasks": { columns: 8, rows: 4 },
  "recent-activity": { columns: 4, rows: 4 },
  "leads-by-source": { columns: 6, rows: 4 },
  "open-tasks": { columns: 3, rows: 2 },
  "overdue-tasks": { columns: 3, rows: 2 },
  "tasks-completed": { columns: 3, rows: 2 },
  "tasks-by-users": { columns: 4, rows: 3 },
  "calls-by-purpose": { columns: 4, rows: 3 },
  "my-calls-today": { columns: 3, rows: 2 },
};

const widgets: Widget[] = [
  {
    id: "total-leads",
    title: "Total Leads",
    description: "Total lead volume across your CRM",
    value: "10  ▲ 100%",
    type: "kpi",
    category: "Org Overview",
  },
  {
    id: "opportunities",
    title: "Opportunities",
    description: "Open revenue opportunities",
    value: "8",
    type: "kpi",
    category: "Org Overview",
  },
  {
    id: "pipeline-value",
    title: "Pipeline Value",
    description: "Current opportunity pipeline value",
    value: "Rs. 35,000.00  ▲ 100%",
    type: "kpi",
    category: "Org Overview",
  },
  {
    id: "active-tasks",
    title: "Active Tasks",
    description: "Tasks requiring attention",
    value: "10  ▲ 100%",
    type: "kpi",
    category: "Org Overview",
  },
  {
    id: "recent-opportunities",
    title: "Recent Opportunities",
    description: "Latest opportunity activity",
    value: "1. Yeshwanth                 Rs. 35,000.00",
    type: "list",
    category: "Org Overview",
  },
  {
    id: "pipeline-summary",
    title: "Pipeline Summary",
    description: "Opportunity pipeline by stage",
    value:
      "LEADS CREATED       10\nDEALS CREATED       10\nDEALS WON             1",
    type: "summary",
    category: "Org Overview",
  },
  {
    id: "upcoming-tasks",
    title: "Upcoming Tasks",
    description: "Tasks due next",
    value: "Remaining: 990        Target: 1000",
    type: "summary",
    category: "Org Overview",
  },
  {
    id: "recent-activity",
    title: "Recent Activity",
    description: "Latest CRM activity",
    value: "Target: Rs. 10,000.00   Rs. 7,00,000.00",
    type: "summary",
    category: "Org Overview",
  },
  {
    id: "leads-by-source",
    title: "LEADS BY SOURCE",
    description: "Lead source distribution",
    value: "Website  4\nReferral  3\nCampaign  3",
    type: "list",
    category: "Org Overview",
  },
  {
    id: "open-tasks",
    title: "OPEN TASKS",
    description: "Open tasks requiring attention",
    value: "0",
    type: "kpi",
    category: "Activity Stats",
  },
  {
    id: "overdue-tasks",
    title: "OVERDUE TASKS",
    description: "Tasks past their due date",
    value: "0",
    type: "kpi",
    category: "Activity Stats",
  },
  {
    id: "tasks-completed",
    title: "TASKS COMPLETED",
    description: "Completed task count",
    value: "0",
    type: "kpi",
    category: "Activity Stats",
  },
  {
    id: "tasks-by-users",
    title: "TASKS BY USERS",
    description: "Task ownership summary",
    value: "Yeshwanth  0",
    type: "list",
    category: "Activity Stats",
  },
  {
    id: "calls-by-purpose",
    title: "CALLS BY PURPOSE",
    description: "Call purpose summary",
    value: "No calls",
    type: "list",
    category: "Activity Stats",
  },
  {
    id: "my-calls-today",
    title: "MY CALLS TODAY",
    description: "Your calls for today",
    value: "0",
    type: "kpi",
    category: "Activity Stats",
  },
];
const defaultIds = [
  "total-leads",
  "opportunities",
  "pipeline-value",
  "active-tasks",
  "recent-opportunities",
  "pipeline-summary",
  "upcoming-tasks",
  "recent-activity",
];
const topRowWidgetIds = new Set([
  "total-leads",
  "opportunities",
  "pipeline-value",
  "active-tasks",
]);
const responseData = (response: any) => response?.data?.data ?? response?.data;
const DEBUG_DND = false;

function debugDnd(label: string, details: Record<string, unknown>) {
  if (DEBUG_DND && typeof window !== "undefined") {
    console.debug(`[homepage-dnd] ${label}`, details);
  }
}

function getWidgetSize(id: string): WidgetSize {
  if (id.startsWith("report-")) return { columns: 12, rows: 4 };
  return widgetSizes[id] || { columns: 3, rows: 2 };
}

function getWidgetDimensions(id: string) {
  const size = getWidgetSize(id);
  return {
    width: size.columns * CELL_WIDTH + (size.columns - 1) * CELL_GAP,
    height: size.rows * CELL_HEIGHT + (size.rows - 1) * CELL_GAP,
  };
}

function defaultLayouts(ids: string[]): Record<string, WidgetLayout> {
  const usesAdminHomeTemplate =
    ids.length === defaultIds.length &&
    defaultIds.every((id) => ids.includes(id));
  if (usesAdminHomeTemplate) {
    const positions: Record<string, { column: number; row: number }> = {
      "total-leads": { column: 0, row: 0 },
      opportunities: { column: 3, row: 0 },
      "pipeline-value": { column: 6, row: 0 },
      "active-tasks": { column: 9, row: 0 },
      "recent-opportunities": { column: 0, row: 1 },
      "pipeline-summary": { column: 8, row: 1 },
      "upcoming-tasks": { column: 0, row: 5 },
      "recent-activity": { column: 8, row: 5 },
    };
    return Object.fromEntries(
      ids.map((id) => {
        const position = positions[id];
        const dimensions = getWidgetDimensions(id);
        return [
          id,
          {
            id,
            x: CELL_ORIGIN + position.column * GRID_SLOT_WIDTH,
            y: CELL_ORIGIN + position.row * GRID_SLOT_HEIGHT,
            ...dimensions,
          },
        ];
      }),
    );
  }
  const layouts: Record<string, WidgetLayout> = {};
  ids.forEach((id) => {
    layouts[id] = findFreeLayout(id, layouts);
  });
  return layouts;
}

function overlaps(first: WidgetLayout, second: WidgetLayout) {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

function canPlace(
  id: string,
  candidate: WidgetLayout,
  layouts: Record<string, WidgetLayout>,
) {
  return Object.values(layouts).every(
    (layout) => layout.id === id || !overlaps(candidate, layout),
  );
}

function findFreeLayout(
  id: string,
  layouts: Record<string, WidgetLayout>,
  preferredColumn = 0,
  preferredRow = 0,
): WidgetLayout {
  const size = getWidgetSize(id);
  const dimensions = getWidgetDimensions(id);
  const maxRows = Math.max(
    GRID_ROWS,
    Object.keys(layouts).length * 5 + size.rows + 1,
  );
  let nearest: { layout: WidgetLayout; distance: number } | null = null;
  for (let row = 0; row < maxRows; row += 1) {
    for (let column = 0; column <= GRID_COLUMNS - size.columns; column += 1) {
      const candidate = {
        id,
        x: CELL_ORIGIN + column * GRID_SLOT_WIDTH,
        y: CELL_ORIGIN + row * GRID_SLOT_HEIGHT,
        ...dimensions,
      };
      if (canPlace(id, candidate, layouts)) {
        const distance =
          Math.abs(column - preferredColumn) +
          Math.abs(row - preferredRow);
        if (
          !nearest ||
          distance < nearest.distance ||
          (distance === nearest.distance && row < (nearest.layout.y - CELL_ORIGIN) / GRID_SLOT_HEIGHT)
        ) {
          nearest = { layout: candidate, distance };
        }
      }
    }
  }
  if (nearest) return nearest.layout;
  return {
    id,
    x: CELL_ORIGIN,
    y: CELL_ORIGIN,
    ...dimensions,
  };
}

function layoutAtDropPoint(
  id: string,
  x: number,
  y: number,
  layouts: Record<string, WidgetLayout>,
): WidgetLayout {
  const size = getWidgetSize(id);
  const dimensions = getWidgetDimensions(id);
  const column = Math.min(
    GRID_COLUMNS - size.columns,
    Math.max(0, Math.floor((x - CELL_ORIGIN) / GRID_SLOT_WIDTH)),
  );
  const row = Math.max(
    0,
    Math.floor((y - CELL_ORIGIN) / GRID_SLOT_HEIGHT),
  );
  const candidate = {
    id,
    x: CELL_ORIGIN + column * GRID_SLOT_WIDTH,
    y: CELL_ORIGIN + row * GRID_SLOT_HEIGHT,
    ...dimensions,
  };
  const canUseCandidate = canPlace(id, candidate, layouts);
  if (canUseCandidate) {
    debugDnd("grid candidate accepted", {
      id,
      inputX: x,
      inputY: y,
      column,
      row,
      candidateX: candidate.x,
      candidateY: candidate.y,
      candidateWidth: candidate.width,
      candidateHeight: candidate.height,
      collision: false,
    });
    return candidate;
  }
  const fallback = findFreeLayout(id, layouts, column, row);
  debugDnd("grid candidate replaced by auto-placement", {
    id,
    inputX: x,
    inputY: y,
    column,
    row,
    candidateX: candidate.x,
    candidateY: candidate.y,
    fallbackX: fallback.x,
    fallbackY: fallback.y,
    fallbackWidth: fallback.width,
    fallbackHeight: fallback.height,
    collision: true,
  });
  return fallback;
}

function snapToSlot(value: number, slot: number) {
  return (
    CELL_ORIGIN + Math.max(0, Math.round((value - CELL_ORIGIN) / slot)) * slot
  );
}

function ReportResultsWidget({ reportId }: { reportId: string }) {
  const [result, setResult] = React.useState<ReportResult | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [dateField, setDateField] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const reportResponse = await fetch(`/api/proxy/api/reports/${reportId}`, { cache: "no-store" });
        const reportBody = await reportResponse.json();
        if (!reportResponse.ok) throw new Error(reportBody?.error || "Unable to load report");
        const loadedReport = reportBody.data || reportBody.report;
        const resultResponse = await fetch("/api/proxy/api/reports/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            objectName: loadedReport.objectName,
            columns: loadedReport.columns || [],
            filters: Array.isArray(loadedReport.filters) ? loadedReport.filters : [],
            filterLogic: loadedReport.filterLogic === "OR" ? "OR" : "AND",
            aggregates: Array.isArray(loadedReport.aggregates) ? loadedReport.aggregates : [],
            groupBy: loadedReport.groupBy || undefined,
            groupColumn: loadedReport.groupColumn || undefined,
            rowGroups: loadedReport.rowGroups || undefined,
            columnGroups: loadedReport.columnGroups || undefined,
            crossFilter: loadedReport.crossFilter || undefined,
            sortBy: loadedReport.sortBy || undefined,
            sortOrder: loadedReport.sortOrder === "asc" ? "asc" : "desc",
            limit: 10000,
          }),
        });
        const resultBody = await resultResponse.json();
        if (!resultResponse.ok) throw new Error(resultBody?.error || "Unable to run report");
        if (active) {
          setResult(resultBody.data || resultBody.result || resultBody);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load report");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [reportId]);

  const dateFields = result?.columns.filter((column) => {
    const type = result.columnTypes?.[column]?.toLowerCase() || "";
    if (["date", "datetime", "timestamp"].includes(type)) return true;
    if (!/(date|time|at)$/i.test(column)) return false;
    return (result.rows || []).some((row) => {
      const value = row[column];
      return value != null && !Number.isNaN(new Date(String(value)).getTime());
    });
  }) || [];
  const activeDateField = dateField || dateFields[0] || "";
  const filteredRows = (result?.rows || []).filter((row) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || result?.columns.some((column) => String(row[column] ?? "").toLowerCase().includes(query));
    const value = activeDateField ? row[activeDateField] : null;
    const timestamp = value == null ? null : new Date(String(value)).getTime();
    const matchesFrom = !from || (timestamp !== null && timestamp >= new Date(from).getTime());
    const matchesTo = !to || (timestamp !== null && timestamp <= new Date(to).getTime() + 59999);
    return matchesSearch && matchesFrom && matchesTo;
  });

  if (loading) return <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">Loading report results...</div>;
  if (error || !result) return <div className="flex flex-1 items-center justify-center p-4 text-xs text-destructive">{error || "No report results"}</div>;

  return (
    <div className="min-h-0 flex-1 overflow-auto p-3">
      <div className="flex min-w-[760px] flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-xl font-semibold text-slate-900">
            Report Results <span className="text-sm font-normal text-slate-500">({filteredRows.length} rows)</span>
          </h4>
          <div className="flex items-center gap-2">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search results..." className="h-9 w-52 rounded-md border px-3 text-sm" />
            <select value={activeDateField} onChange={(event) => setDateField(event.target.value)} className="h-9 rounded-md border px-2 text-sm">
              <option value="">Filter by date/time</option>
              {dateFields.map((field) => <option key={field} value={field}>{field}</option>)}
            </select>
            <input type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} className="h-9 rounded-md border px-2 text-sm" aria-label="From date and time" />
            <input type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} className="h-9 rounded-md border px-2 text-sm" aria-label="To date and time" />
          </div>
        </div>
        <span className="w-fit rounded-full border px-3 py-1 text-xs font-medium">Record Count: {filteredRows.length}</span>
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b text-slate-800">{result.columns.map((column) => <th key={column} className="px-3 py-2 font-semibold">{column}</th>)}</tr></thead>
          <tbody>{filteredRows.map((row, index) => <tr key={index} className="border-b">{result.columns.map((column) => <td key={column} className="whitespace-nowrap px-3 py-2">{String(row[column] ?? "")}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function WidgetContent({ widget }: { widget: Widget }) {
  if (widget.id.startsWith("report-")) {
    return <ReportResultsWidget reportId={widget.id.replace("report-", "")} />;
  }

  if (widget.id === "leads-by-source") {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-4 overflow-hidden p-3 sm:gap-6">
        <div
          className="relative aspect-square w-[min(42%,180px)] shrink-0 rounded-full"
          style={{
            background:
              "conic-gradient(#72d992 0 20%, #5ea2c0 20% 40%, #4e6fc1 40% 50%, #e84d39 50% 70%, #f7b83b 70% 80%, #bf5db1 80% 90%, #12c4c2 90% 100%)",
          }}
        >
          <div className="absolute inset-[24%] rounded-full bg-white" />
        </div>
        <div className="min-w-0 space-y-1 text-[clamp(9px,1.4vw,12px)] text-slate-700">
          {["Advertisement", "Cold Call", "External Referral", "Online Store", "Partner", "Web Download"].map(
            (label, index) => (
              <div key={label} className="flex items-center gap-2 truncate">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor: ["#72d992", "#5ea2c0", "#4e6fc1", "#e84d39", "#f7b83b", "#12c4c2"][index],
                  }}
                />
                <span className="truncate">{label} {index % 3 + 1}</span>
              </div>
            ),
          )}
        </div>
      </div>
    );
  }

  if (widget.id === "recent-opportunities") {
    return (
      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] border-b border-slate-200 py-2 text-[clamp(10px,1.5vw,14px)] font-medium">
          <span>Deal Owner</span>
          <span className="text-right">Sum Of Amount</span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] py-3 text-[clamp(10px,1.5vw,14px)]">
          <span className="truncate">1. Yeshwanth</span>
          <span className="truncate text-right">Rs. 35,000.00</span>
        </div>
      </div>
    );
  }

  if (widget.id === "pipeline-summary") {
    return (
      <div className="grid min-h-0 flex-1 grid-rows-4 overflow-auto px-3 pb-3 text-[clamp(10px,1.5vw,14px)]">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center border-b border-slate-200">
          <span>LEADS CREATED</span><span className="text-center">10</span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center border-b border-slate-200 bg-muted/50">
          <span>DEALS CREATED</span><span className="text-center">10</span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center border-b border-slate-200">
          <span>DEALS WON</span><span className="text-center">1</span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center bg-muted/50">
          <span>REVENUE WON</span><span className="truncate text-center">Rs. 35,000.00</span>
        </div>
      </div>
    );
  }

  if (widget.id === "upcoming-tasks" || widget.id === "recent-activity") {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 overflow-x-hidden overflow-y-auto px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1 text-[clamp(10px,1.5vw,14px)]">
          <span className="min-w-0 max-w-full break-words">Entire Org</span>
          <span className="min-w-0 max-w-full break-words text-right">Target: Rs. 10,000.00</span>
        </div>
        <div className="h-[clamp(22px,16%,42px)] w-full overflow-hidden rounded-sm bg-slate-200">
          <div className="h-full w-[82%] bg-emerald-300/70" />
        </div>
        <div className="flex justify-between text-[clamp(9px,1.3vw,12px)] text-muted-foreground">
          <span>0</span><span>400000</span><span>800000</span>
        </div>
        <p className="text-center text-[clamp(12px,1.8vw,18px)] font-semibold text-slate-700">Sum of Amount</p>
      </div>
    );
  }

  if (widget.type === "kpi") {
    return (
      <div className="flex min-h-0 flex-1 items-center px-4 py-3">
        <p className="truncate text-[clamp(15px,3vw,28px)] font-semibold text-slate-800">{widget.value}</p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 py-3 text-[clamp(11px,1.6vw,16px)] font-medium whitespace-pre-line">
      {widget.value}
    </div>
  );
}

const resizeHandles = {
  top: {
    width: 6,
    height: 6,
    left: "50%",
    top: -2,
    marginLeft: -3,
    cursor: "ns-resize",
    background: "#3b82f6",
    borderRadius: 1,
  },
  right: {
    width: 6,
    height: 6,
    top: "50%",
    right: -2,
    marginTop: -3,
    cursor: "ew-resize",
    background: "#3b82f6",
    borderRadius: 1,
  },
  bottom: {
    width: 6,
    height: 6,
    left: "50%",
    bottom: -2,
    marginLeft: -3,
    cursor: "ns-resize",
    background: "#3b82f6",
    borderRadius: 1,
  },
  left: {
    width: 6,
    height: 6,
    top: "50%",
    left: -2,
    marginTop: -3,
    cursor: "ew-resize",
    background: "#3b82f6",
    borderRadius: 1,
  },
  topRight: {
    width: 6,
    height: 6,
    right: -3,
    top: -3,
    cursor: "nesw-resize",
    background: "#3b82f6",
    borderRadius: 1,
  },
  bottomRight: {
    width: 6,
    height: 6,
    right: -3,
    bottom: -3,
    cursor: "nwse-resize",
    background: "#3b82f6",
    borderRadius: 1,
  },
  bottomLeft: {
    width: 6,
    height: 6,
    left: -3,
    bottom: -3,
    cursor: "nesw-resize",
    background: "#3b82f6",
    borderRadius: 1,
  },
  topLeft: {
    width: 6,
    height: 6,
    left: -3,
    top: -3,
    cursor: "nwse-resize",
    background: "#3b82f6",
    borderRadius: 1,
  },
};

export default function CustomizeProfileHomePage() {
  const params = useParams<{ profileName: string }>();
  const router = useRouter();
  const homepageId =
    params.profileName === "create" ? null : params.profileName;
  const [ids, setIds] = React.useState(defaultIds);
  const [layouts, setLayouts] = React.useState<Record<string, WidgetLayout>>(
    () => defaultLayouts(defaultIds),
  );
  const [profiles, setProfiles] = React.useState<Profile[]>([]);
  const [reportWidgets, setReportWidgets] = React.useState<Widget[]>([]);
  const [profileIds, setProfileIds] = React.useState<string[]>([]);
  const [name, setName] = React.useState("Untitled Homepage");
  const [description, setDescription] = React.useState("");
  const [widgetSearch, setWidgetSearch] = React.useState("");
  const [widgetCategory, setWidgetCategory] =
    React.useState<Widget["category"]>("Org Overview");
  const [profileSearch, setProfileSearch] = React.useState("");
  const [shareOpen, setShareOpen] = React.useState(false);
  const [profilePickerOpen, setProfilePickerOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [loading, setLoading] = React.useState(Boolean(homepageId));
  const [notice, setNotice] = React.useState("");
  const [error, setError] = React.useState("");
  const [selectedWidgetId, setSelectedWidgetId] = React.useState<string | null>(
    null,
  );
  const [widgetRenderVersion, setWidgetRenderVersion] = React.useState(0);
  const [dropPreview, setDropPreview] = React.useState<WidgetLayout | null>(
    null,
  );
  const pointerPosition = React.useRef({ x: 0, y: 0 });
  const pointerDraggingWidgetId = React.useRef<string | null>(null);
  const canvasRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const trackPointer = (event: PointerEvent) => {
      pointerPosition.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener("pointermove", trackPointer);
    return () => window.removeEventListener("pointermove", trackPointer);
  }, []);

  React.useEffect(() => {
    let active = true;
    Promise.all([
      profileApi.list({ limit: 100 }),
      homepageId ? homepageApi.get(homepageId) : Promise.resolve(null),
      reportApi.list({ limit: 100, view: "all" }),
    ])
      .then(([profilesResponse, homepageResponse, reportsResponse]) => {
        if (!active) return;
        const profileData = responseData(profilesResponse);
        setProfiles(
          (Array.isArray(profileData)
            ? profileData
            : (profileData?.profiles ?? [])) as Profile[],
        );
        const reportData = responseData(reportsResponse);
        const loadedReportWidgets: Widget[] = (Array.isArray(reportData) ? reportData : [])
          .map((report: ReportWidgetRow) => ({
            id: `report-${report.id}`,
            title: report.name,
            description: report.description || `${report.type || "Report"} report`,
            value: "",
            type: "list" as const,
            category: "Reports" as const,
          }));
        setReportWidgets(loadedReportWidgets);
        if (homepageResponse) {
          const homepage = responseData(homepageResponse);
          setName(homepage.name);
          setDescription(homepage.description || "");
          const saved = Array.isArray(homepage.layout) ? homepage.layout : [];
          const savedIds = saved
            .map((item: any) => (typeof item === "string" ? item : item.id))
            .filter((id: string) => [...widgets, ...loadedReportWidgets].some((widget) => widget.id === id));
          const effectiveIds = savedIds.length ? savedIds : defaultIds;
          setIds(effectiveIds);
          const nextLayouts = defaultLayouts(effectiveIds);
          saved
            .filter((item: any) => typeof item !== "string")
            .forEach((item: WidgetLayout) => {
              nextLayouts[item.id] = topRowWidgetIds.has(item.id)
                ? {
                    ...item,
                    ...getWidgetDimensions(item.id),
                    x: item.x,
                    y: item.y,
                  }
                : item;
            });
          setLayouts(nextLayouts);
          setProfileIds(
            (homepage.sharedProfiles || []).map((item: any) => item.profile.id),
          );
        }
      })
      .then(() => {
        if (!homepageId) {
          setName("Untitled Homepage");
          setDescription("");
          setIds(defaultIds);
          setLayouts(defaultLayouts(defaultIds));
          setProfileIds([]);
        }
      })
      .catch(() => active && setError("Unable to load this home page."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [homepageId]);

  React.useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  React.useEffect(() => {
    ids.forEach((id) => {
      const layout = layouts[id];
      if (layout) {
        debugDnd("widget rendered from state", {
          id,
          renderedX: layout.x,
          renderedY: layout.y,
          renderedWidth: layout.width,
          renderedHeight: layout.height,
        });
      }
    });
  }, [ids, layouts]);

  const widgetCatalog = [...widgets, ...reportWidgets];
  const selectedWidgets = ids
    .map((id) => widgetCatalog.find((widget) => widget.id === id))
    .filter((widget): widget is Widget => Boolean(widget));

  const availableWidgets = widgetCatalog.filter(
    (widget) =>
      widget.category === widgetCategory &&
      !ids.includes(widget.id) &&
      widget.title.toLowerCase().includes(widgetSearch.toLowerCase()),
  );
  const availableProfiles = profiles.filter(
    (profile) =>
      !profileIds.includes(profile.id) &&
      profile.name.toLowerCase().includes(profileSearch.toLowerCase()),
  );
  const layoutBottom = Object.values(layouts).reduce(
    (bottom, layout) => Math.max(bottom, layout.y + layout.height),
    0,
  );
  const canvasHeight = Math.max(
    860,
    layoutBottom + CELL_ORIGIN + GRID_SLOT_HEIGHT,
  );
  const canvasRows = Math.max(
    GRID_ROWS,
    Math.ceil((canvasHeight - CELL_ORIGIN) / GRID_SLOT_HEIGHT),
  );
  const canvasCells = Array.from(
    { length: GRID_COLUMNS * canvasRows },
    (_, index) => index,
  );

  const getPointerLayout = (id: string) => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    const dropX = bounds
      ? pointerPosition.current.x - bounds.left
      : CELL_ORIGIN;
    const dropY = bounds ? pointerPosition.current.y - bounds.top : CELL_ORIGIN;
    return layoutAtDropPoint(id, dropX, dropY, layouts);
  };

  const commitAvailableWidget = (id: string) => {
    if (ids.includes(id)) return;
    const layout = getPointerLayout(id);
    flushSync(() => {
      setDropPreview(null);
      setWidgetRenderVersion((version) => version + 1);
      setIds((current) => current.includes(id) ? current : [...current, id]);
      setLayouts((current) => ({ ...current, [id]: layout }));
    });
  };

  const onDragStart = (start: DragStart) => {
    if (start.source.droppableId === "available") {
      debugDnd("drag start", {
        id: start.draggableId,
        pointerX: pointerPosition.current.x,
        pointerY: pointerPosition.current.y,
      });
      setDropPreview(getPointerLayout(start.draggableId));
    }
  };

  const onDragUpdate = (update: DragUpdate) => {
    if (
      update.source.droppableId !== "available" ||
      update.destination?.droppableId !== "canvas"
    ) {
      setDropPreview(null);
      return;
    }
    debugDnd("drag over canvas", {
      id: update.draggableId,
      pointerX: pointerPosition.current.x,
      pointerY: pointerPosition.current.y,
      destinationIndex: update.destination.index,
    });
    setDropPreview(getPointerLayout(update.draggableId));
  };

  const onDrop = (result: DropResult) => {
    debugDnd("drag end", {
      draggableId: result.draggableId,
      source: result.source.droppableId,
      destination: result.destination?.droppableId ?? null,
      destinationIndex: result.destination?.index ?? null,
    });
    pointerDraggingWidgetId.current = null;
    const previewForDrop =
      dropPreview?.id === result.draggableId ? dropPreview : null;
    setDropPreview(null);
    const canvasBounds = canvasRef.current?.getBoundingClientRect();
    const isPointerOverCanvas = canvasBounds
      ? pointerPosition.current.x >= canvasBounds.left &&
        pointerPosition.current.x <= canvasBounds.right &&
        pointerPosition.current.y >= canvasBounds.top &&
        pointerPosition.current.y <= canvasBounds.bottom
      : false;
    if (!result.destination && !isPointerOverCanvas && !previewForDrop) return;
    if (
      result.source.droppableId === "available" &&
      (result.destination?.droppableId === "canvas" ||
        isPointerOverCanvas ||
        previewForDrop)
    ) {
      const bounds = canvasBounds;
      const dropX = bounds
        ? pointerPosition.current.x - bounds.left
        : CELL_ORIGIN;
      const dropY = bounds
        ? pointerPosition.current.y - bounds.top
        : CELL_ORIGIN;
      const finalLayout =
        layoutAtDropPoint(result.draggableId, dropX, dropY, layouts);
      debugDnd("drop received", {
        id: result.draggableId,
        pointerX: pointerPosition.current.x,
        pointerY: pointerPosition.current.y,
        canvasLeft: bounds?.left ?? null,
        canvasTop: bounds?.top ?? null,
        dropX,
        dropY,
        assignedX: finalLayout.x,
        assignedY: finalLayout.y,
        assignedWidth: finalLayout.width,
        assignedHeight: finalLayout.height,
        destinationIndex: result.destination?.index ?? -1,
      });

      flushSync(() => {
        setWidgetRenderVersion((version) => version + 1);
        setIds((current) => {
          const next = [...current];
          const insertIndex = result.destination?.index ?? next.length;
          next.splice(insertIndex, 0, result.draggableId);
          return next;
        });
        setLayouts((current) => ({
          ...current,
          [result.draggableId]: current[result.draggableId] || finalLayout,
        }));
        debugDnd("layout state committed", {
          id: result.draggableId,
          storedX: finalLayout.x,
          storedY: finalLayout.y,
          storedWidth: finalLayout.width,
          storedHeight: finalLayout.height,
        });
      });
    } else if (
      result.source.droppableId === "canvas" &&
      result.destination?.droppableId === "canvas"
    ) {
      const bounds = canvasRef.current?.getBoundingClientRect();
      const dropX = bounds
        ? pointerPosition.current.x - bounds.left
        : CELL_ORIGIN;
      const dropY = bounds
        ? pointerPosition.current.y - bounds.top
        : CELL_ORIGIN;
      const movedLayout = layoutAtDropPoint(
        result.draggableId,
        dropX,
        dropY,
        layouts,
      );
      setWidgetRenderVersion((version) => version + 1);
      setLayouts((current) => ({
        ...current,
        [result.draggableId]: movedLayout,
      }));
      setIds((current) => {
        const next = [...current];
        const [item] = next.splice(result.source.index, 1);
        next.splice(result.destination!.index, 0, item);
        return next;
      });
    }
  };

  const updateLayout = (id: string, changes: Partial<WidgetLayout>) =>
    setLayouts((current) => ({
      ...current,
      [id]: { ...current[id], ...changes },
    }));
  const tryUpdateLayout = (id: string, changes: Partial<WidgetLayout>) => {
    setLayouts((current) => {
      const candidate = { ...current[id], ...changes };
      return canPlace(id, candidate, current)
        ? { ...current, [id]: candidate }
        : current;
    });
  };
  const removeWidget = (id: string) => {
    setIds((current) => current.filter((item) => item !== id));
    setLayouts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setSelectedWidgetId((current) => (current === id ? null : current));
  };

  const saveHomepage = async () => {
    if (!name.trim()) {
      setError("Enter a name for the home page.");
      return;
    }
    if (!profileIds.length) {
      setError("Add at least one profile before saving.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const layout = ids.map(
        (id) => layouts[id] || findFreeLayout(id, layouts),
      );
      const payload = {
        name: name.trim(),
        description: description.trim(),
        layout,
        profileIds,
      };
      const response = homepageId
        ? await homepageApi.update(homepageId, payload)
        : await homepageApi.create(payload);
      setNotice(response.data.message || "Home page saved successfully");
      setShareOpen(false);
      window.setTimeout(() => router.push("/admin/customize-home"), 5000);
    } catch (saveError: any) {
      setError(
        saveError.response?.data?.error || "Unable to save the home page.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );

  return (
    <div className="fixed inset-0 z-[60] flex min-h-0 flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between border-b bg-card px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/admin/customize-home")}
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="min-w-0 flex-1">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-label="Homepage name"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm font-medium"
              />
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                aria-label="Homepage description"
                placeholder="Enter Description"
                className="mt-2 h-8 w-full rounded-md border bg-background px-3 text-sm text-muted-foreground"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label="More homepage options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => router.push("/admin/customize-home")}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={() => setShareOpen(true)} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            Save and Share
          </Button>
        </div>
      </header>
      <DragDropContext
        onDragStart={onDragStart}
        onDragUpdate={onDragUpdate}
        onDragEnd={onDrop}
      >
        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-[68px] shrink-0 border-r bg-card text-muted-foreground md:flex md:flex-col">
            <div className="flex h-14 items-center justify-center border-b border-border text-xs font-bold text-foreground">
              DCT
            </div>
            <nav className="flex flex-1 flex-col items-center gap-2 py-3">
              {[
                [LayoutDashboard, "Dashb..."],
                [BarChart3, "Reports"],
              ].map(([Icon, label]) => (
                <button
                  key={label as string}
                  type="button"
                  onClick={() => {
                    if (label === "Reports") setWidgetCategory("Reports");
                  }}
                  className="flex w-full flex-col items-center gap-1 px-1 py-2 text-[11px] hover:bg-accent hover:text-foreground"
                >
                  <Icon className="h-4 w-4" />
                  <span>{label as string}</span>
                </button>
              ))}
            </nav>
            <div className="border-t border-border p-2 text-center text-[11px] text-muted-foreground">
              Help
            </div>
          </aside>
          <aside className="hidden w-72 shrink-0 border-r bg-card text-foreground md:flex md:flex-col">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-semibold">Dashboard Components</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Drag a component to the page
              </p>
              <select
                value={widgetCategory}
                onChange={(event) => {
                  setWidgetCategory(event.target.value as Widget["category"]);
                  setWidgetSearch("");
                }}
                aria-label="Component category"
                className="mt-4 h-9 w-full rounded-md border border-input bg-background px-2 text-[13px] text-foreground outline-none"
              >
                <option>Org Overview</option>
                <option>Activity Stats</option>
                <option>Reports</option>
              </select>
              <div className="mt-2 flex items-center rounded-md border border-input bg-background px-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  value={widgetSearch}
                  onChange={(event) => setWidgetSearch(event.target.value)}
                  placeholder="Search"
                  aria-label="Search dashboard components"
                  className="h-9 w-full bg-transparent px-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>
            <Droppable droppableId="available">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`min-h-0 flex-1 space-y-2 overflow-y-auto p-4 ${snapshot.isDraggingOver ? "bg-muted/50" : ""}`}
                >
                  {availableWidgets.map((widget, index) => (
                    <Draggable key={widget.id} draggableId={widget.id} index={index}>
                      {(drag, state) => (
                        <div
                          ref={drag.innerRef}
                          {...drag.draggableProps}
                          {...drag.dragHandleProps}
                          style={{
                            ...drag.draggableProps.style,
                            ...(state.isDropAnimating ? { opacity: 0, transition: "none" } : {}),
                          }}
                          className={`flex cursor-grab items-start gap-2 rounded-md border border-border bg-card px-3 py-3 text-sm ${state.isDragging ? "ring-2 ring-primary" : "hover:bg-muted/50"}`}
                        >
                          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0">
                            <span className="block truncate">{widget.title}</span>
                            {widget.category === "Reports" && (
                              <span className="mt-1 block truncate text-xs text-muted-foreground">{widget.description}</span>
                            )}
                          </span>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  {!availableWidgets.length && (
                    <p className="py-8 text-center text-xs text-muted-foreground">
                      No dashboard components found
                    </p>
                  )}
                </div>
              )}
            </Droppable>
          </aside>
          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-background p-3 md:p-4">
            <div className="mx-auto w-full max-w-none">
              <div className="mb-3 flex items-center justify-between rounded-lg border bg-card px-3 py-2 shadow-sm">
                <div>
                  <h1 className="font-semibold">{name}&apos;s Home</h1>
                  <p className="text-xs text-muted-foreground">
                    Drag, resize, and arrange the dashboard components.
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {selectedWidgets.length} components
                </span>
              </div>
              <Droppable droppableId="canvas">
                {(provided, snapshot) => (
                  <div
                    ref={(node) => {
                      provided.innerRef(node);
                      canvasRef.current = node;
                    }}
                    {...provided.droppableProps}
                    onClick={() => setSelectedWidgetId(null)}
                    onDragOver={(event) => {
                      if (Array.from(event.dataTransfer.types).includes("text/report-widget")) {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "copy";
                      }
                    }}
                    onDrop={(event) => {
                      const reportId = event.dataTransfer.getData("text/report-widget");
                      if (!reportId) return;
                      event.preventDefault();
                      pointerPosition.current = {
                        x: event.clientX,
                        y: event.clientY,
                      };
                      commitAvailableWidget(reportId);
                    }}
                    onPointerUp={() => {
                      const widgetId = pointerDraggingWidgetId.current;
                      if (widgetId) {
                        pointerDraggingWidgetId.current = null;
                        commitAvailableWidget(widgetId);
                      }
                    }}
                    onMouseUp={() => {
                      const widgetId = pointerDraggingWidgetId.current;
                      if (widgetId) {
                        pointerDraggingWidgetId.current = null;
                        commitAvailableWidget(widgetId);
                      }
                    }}
                    className={`relative w-full overflow-hidden rounded-lg border border-border bg-white ${snapshot.isDraggingOver ? "ring-2 ring-primary" : ""}`}
                    style={{
                      minHeight: canvasHeight,
                      width: "100%",
                      maxWidth: "100%",
                      backgroundImage: "linear-gradient(#f8fafc 1px, transparent 1px), linear-gradient(90deg, #f8fafc 1px, transparent 1px)",
                      backgroundSize: `${CELL_WIDTH + CELL_GAP}px ${CELL_HEIGHT + CELL_GAP}px`,
                      backgroundPosition: `${CELL_ORIGIN}px ${CELL_ORIGIN}px`,
                      backgroundColor: "white",
                    }}
                  >
                    <div
                      className="pointer-events-none z-0"
                      aria-hidden="true"
                      style={{ position: "absolute", inset: 0 }}
                    >
                      {canvasCells.map((cell) => (
                        <div
                          key={cell}
                          className="absolute rounded-sm bg-slate-100/80"
                          style={{
                            position: "absolute",
                            left: CELL_ORIGIN + (cell % GRID_COLUMNS) * (CELL_WIDTH + CELL_GAP),
                            top: CELL_ORIGIN + Math.floor(cell / GRID_COLUMNS) * (CELL_HEIGHT + CELL_GAP),
                            width: CELL_WIDTH,
                            height: CELL_HEIGHT,
                          }}
                        />
                      ))}
                    </div>
                    {dropPreview && snapshot.isDraggingOver && (
                      <div
                        className="pointer-events-none z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-blue-500 bg-blue-100/70 text-xs font-semibold text-blue-700"
                        style={{
                          position: "absolute",
                          left: dropPreview.x,
                          top: dropPreview.y,
                          width: dropPreview.width,
                          height: dropPreview.height,
                        }}
                      >
                        Drop component here
                      </div>
                    )}
                    {selectedWidgets.map((widget) => {
                      const layout =
                        layouts[widget.id] ||
                        findFreeLayout(widget.id, layouts);
                      return (
                        <Rnd
                          key={`${widget.id}-${widgetRenderVersion}`}
                          bounds="parent"
                          style={{
                            zIndex: selectedWidgetId === widget.id ? 2 : 1,
                            maxWidth: `calc(100% - ${layout.x + CELL_ORIGIN}px)`,
                            boxSizing: "border-box",
                          }}
                          size={{ width: layout.width, height: layout.height }}
                          position={{ x: layout.x, y: layout.y }}
                          minWidth={MIN_WIDGET_WIDTH}
                          minHeight={MIN_WIDGET_HEIGHT}
                          grid={[GRID_SIZE, GRID_SIZE]}
                          resizeGrid={[GRID_SIZE, GRID_SIZE]}
                          enableResizing={
                            selectedWidgetId === widget.id
                              ? {
                                  top: true,
                                  right: true,
                                  bottom: true,
                                  left: true,
                                  topRight: true,
                                  bottomRight: true,
                                  bottomLeft: true,
                                  topLeft: true,
                                }
                              : false
                          }
                          resizeHandleStyles={resizeHandles}
                          onDragStart={() => setSelectedWidgetId(widget.id)}
                          onDrag={(_, data) =>
                            tryUpdateLayout(widget.id, { x: data.x, y: data.y })
                          }
                          onDragStop={(_, data) =>
                            tryUpdateLayout(widget.id, {
                              x: snapToSlot(data.x, GRID_SLOT_WIDTH),
                              y: snapToSlot(data.y, GRID_SLOT_HEIGHT),
                            })
                          }
                          onResize={(_, __, ref, ___, position) =>
                            tryUpdateLayout(widget.id, {
                              width: ref.offsetWidth,
                              height: ref.offsetHeight,
                              x: position.x,
                              y: position.y,
                            })
                          }
                          onResizeStop={(_, __, ref, ___, position) =>
                            tryUpdateLayout(widget.id, {
                              width: Math.max(
                                MIN_WIDGET_WIDTH,
                                Math.round((ref.offsetWidth + CELL_GAP) / (CELL_WIDTH + CELL_GAP)) * CELL_WIDTH +
                                  (Math.max(1, Math.round((ref.offsetWidth + CELL_GAP) / (CELL_WIDTH + CELL_GAP))) - 1) * CELL_GAP,
                              ),
                              height: Math.max(
                                MIN_WIDGET_HEIGHT,
                                Math.round((ref.offsetHeight + CELL_GAP) / (CELL_HEIGHT + CELL_GAP)) * CELL_HEIGHT +
                                  (Math.max(1, Math.round((ref.offsetHeight + CELL_GAP) / (CELL_HEIGHT + CELL_GAP))) - 1) * CELL_GAP,
                              ),
                              x: snapToSlot(position.x, GRID_SLOT_WIDTH),
                              y: snapToSlot(position.y, GRID_SLOT_HEIGHT),
                            })
                          }
                        >
                          <section
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedWidgetId(widget.id);
                            }}
                            className={`flex h-full w-full min-h-0 flex-col overflow-hidden rounded-lg border bg-white shadow-sm ${selectedWidgetId === widget.id ? "border-primary" : "border-border"}`}
                          >
                            <div className="flex shrink-0 items-start justify-between gap-2 px-3 py-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <GripVertical className="h-3 w-3 cursor-move text-muted-foreground" />
                                <div className="min-w-0">
                                  <h3 className="truncate text-xs font-semibold">
                                    {widget.title}
                                  </h3>
                                  <p className="truncate text-[11px] text-muted-foreground">
                                    {widget.description}
                                  </p>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => removeWidget(widget.id)}
                                aria-label={`Close ${widget.title}`}
                              >
                                <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                              </Button>
                            </div>
                            <WidgetContent widget={widget} />
                          </section>
                        </Rnd>
                      );
                    })}
                    {provided.placeholder}
                    {!selectedWidgets.length && (
                      <div
                        className="pointer-events-none z-20 flex items-center justify-center p-6"
                        style={{ position: "absolute", inset: 0 }}
                      >
                        <div className="flex min-h-[276px] w-full max-w-[430px] flex-col items-center justify-center rounded-lg border border-border bg-white px-8 py-10 text-center shadow-sm">
                          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg border border-blue-200 bg-white shadow-sm">
                            <Blocks className="h-6 w-6 text-emerald-400" />
                          </div>
                          <p className="mt-6 text-xl font-medium tracking-tight text-foreground">
                            Drag and drop a component
                          </p>
                          <p className="mt-2 text-sm text-muted-foreground">
                            Build your Homepage by adding components.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          </main>
        </div>
      </DragDropContext>
      {error && (
        <div className="fixed bottom-5 left-1/2 z-[95] -translate-x-1/2 rounded-md bg-destructive px-4 py-3 text-sm text-destructive-foreground shadow-md">
          {error}
        </div>
      )}
      {notice && (
        <div className="fixed bottom-5 left-1/2 z-[95] flex -translate-x-1/2 items-center gap-2 rounded-md bg-emerald-600 px-4 py-3 text-sm text-white shadow-md">
          <Check className="h-4 w-4" />
          {notice}
        </div>
      )}
      {shareOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-lg bg-card p-6 shadow-md">
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-semibold">{name}</h2>
              <button onClick={() => setShareOpen(false)} aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-6 space-y-4">
              <label className="block text-sm font-medium">
                Name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-2 h-9 w-full rounded-md border border-input bg-background px-3 text-[13px]"
                />
              </label>
              <label className="block text-sm font-medium">
                Enter Description
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="mt-2 min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-[13px]"
                />
              </label>
              <div>
                <p className="text-sm font-medium">Share with</p>
                <div className="mt-2 flex min-h-9 flex-wrap items-center gap-2 rounded-md border border-input px-2 py-1">
                  {profileIds.map((id) => (
                    <span
                      key={id}
                      className="rounded bg-muted px-2 py-1 text-sm"
                    >
                      {profiles.find((profile) => profile.id === id)?.name}
                      <button
                        className="ml-2"
                        onClick={() =>
                          setProfileIds((current) =>
                            current.filter((item) => item !== id),
                          )
                        }
                        aria-label="Remove profile"
                      >
                        x
                      </button>
                    </span>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                    onClick={() => setProfilePickerOpen(true)}
                  >
                    Add Profile
                  </Button>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShareOpen(false)}>
                Cancel
              </Button>
              <Button onClick={saveHomepage} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {profilePickerOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-lg bg-card p-6 shadow-md">
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-semibold">Share with</h2>
              <button
                onClick={() => setProfilePickerOpen(false)}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-5 grid min-h-[300px] grid-cols-2 rounded-md border">
              <div className="border-r">
                <div className="flex items-center border-b px-3">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <input
                    value={profileSearch}
                    onChange={(event) => setProfileSearch(event.target.value)}
                    placeholder="Search profiles"
                    className="h-9 w-full bg-transparent px-2 text-[13px] outline-none"
                  />
                </div>
                {availableProfiles.map((profile) => (
                  <div
                    key={profile.id}
                    className="flex items-center justify-between px-3 py-2"
                  >
                    <span className="text-sm">{profile.name}</span>
                    <Button
                      size="sm"
                      onClick={() =>
                        setProfileIds((current) => [...current, profile.id])
                      }
                    >
                      Add
                    </Button>
                  </div>
                ))}
              </div>
              <div className="p-4">
                <p className="font-medium">Selected</p>
                {profileIds.map((id) => (
                  <div
                    key={id}
                    className="mt-2 flex items-center justify-between rounded bg-muted px-3 py-2 text-sm"
                  >
                    {profiles.find((profile) => profile.id === id)?.name}
                    <button
                      onClick={() =>
                        setProfileIds((current) =>
                          current.filter((item) => item !== id),
                        )
                      }
                      aria-label="Remove profile"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <Button onClick={() => setProfilePickerOpen(false)}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
