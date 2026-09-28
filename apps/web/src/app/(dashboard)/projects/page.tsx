"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/crm/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, MoreHorizontal, Eye, Edit, Trash2, Building2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { projectApi } from "@/lib/api";
import { formatDate } from "@/lib/date-format";

interface Project {
  id: string;
  name: string;
  location: string;
  type: "residential" | "commercial" | "mixed";
  totalUnits: number;
  soldUnits: number;
  status: "planning" | "under-construction" | "completed";
  completionPercentage: number;
  startDate: string;
  expectedCompletion: string;
}

const statusColors: Record<string, string> = {
  planning: "bg-yellow-100 text-yellow-800",
  "under-construction": "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
};

const typeColors: Record<string, string> = {
  residential: "bg-purple-100 text-purple-800",
  commercial: "bg-orange-100 text-orange-800",
  mixed: "bg-indigo-100 text-indigo-800",
};

function mapProject(item: any): Project {
  const statusMap: Record<string, Project["status"]> = {
    PLANNING: "planning",
    PLANNED: "planning",
    UNDER_CONSTRUCTION: "under-construction",
    "UNDER-CONSTRUCTION": "under-construction",
    ONGOING: "under-construction",
    COMPLETED: "completed",
    ACTIVE: "under-construction",
  };
  const total = item.totalUnits ?? item._count?.units ?? 0;
  return {
    id: item.id,
    name: item.name || "Project",
    location: [item.city, item.state].filter(Boolean).join(", ") || item.address || "—",
    type: "residential",
    totalUnits: total,
    soldUnits: item.soldUnits ?? 0,
    status: statusMap[(item.status || "").toUpperCase()] || "planning",
    completionPercentage: item.completionPercentage ?? 0,
    startDate: item.startDate || item.createdAt,
    expectedCompletion: item.expectedCompletion || item.endDate || item.createdAt,
  };
}

const columns: ColumnDef<Project>[] = [
  {
    accessorKey: "name",
    header: "Project Name",
    cell: ({ row }) => (
      <Link href={`/projects/${row.original.id}`} className="hover:underline font-medium">
        {row.getValue("name")}
      </Link>
    ),
  },
  {
    accessorKey: "location",
    header: "Location",
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => {
      const type = row.getValue("type") as string;
      return (
        <Badge className={typeColors[type] || "bg-gray-100 text-gray-800"}>
          {type}
        </Badge>
      );
    },
  },
  {
    accessorKey: "totalUnits",
    header: "Units",
    cell: ({ row }) => {
      const project = row.original;
      return (
        <span>
          {project.soldUnits}/{project.totalUnits}
        </span>
      );
    },
  },
  {
    accessorKey: "completionPercentage",
    header: "Progress",
    cell: ({ row }) => {
      const percentage = row.getValue("completionPercentage") as number;
      return (
        <div className="flex items-center gap-2">
          <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <span className="text-sm">{percentage}%</span>
        </div>
      );
    },
  },
  {
    accessorKey: "startDate",
    header: "Start",
    cell: ({ row }) => formatDate(row.getValue("startDate") as string),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      return (
        <Badge className={statusColors[status] || "bg-gray-100 text-gray-800"}>
          {status.replace("-", " ")}
        </Badge>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const project = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/projects/${project.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                View Inventory
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

export default function ProjectsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = React.useState(1);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [totalItems, setTotalItems] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchProjects = async () => {
      try {
        setIsLoading(true);
        const res = await projectApi.list({ page: currentPage, limit: 20 });
        if (res.data.success && res.data.data) {
          const mapped = res.data.data.map(mapProject);
          setProjects(mapped);
          setTotalItems(res.data.pagination?.total ?? mapped.length);
        } else {
          setProjects([]);
          setTotalItems(0);
        }
      } catch {
        toast({ title: "Error", description: "Failed to load projects", variant: "destructive" as any });
        setProjects([]);
        setTotalItems(0);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProjects();
  }, [currentPage, toast]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Projects</h1>
          <p className="text-muted-foreground">
            Manage your real estate projects and inventory
          </p>
        </div>
        <Button onClick={() => toast({ title: "New Project", description: "Create project form coming soon" })}>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Building2 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Projects</p>
                <p className="text-xl font-semibold">{projects.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Building2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Units</p>
                <p className="text-xl font-semibold">
                  {projects.reduce((sum, p) => sum + p.totalUnits, 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Building2 className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Units Sold</p>
                <p className="text-xl font-semibold">
                  {projects.reduce((sum, p) => sum + p.soldUnits, 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={projects}
        searchKey="name"
        searchPlaceholder="Search projects..."
          totalItems={totalItems}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          serverPagination
        />
    </div>
  );
}
