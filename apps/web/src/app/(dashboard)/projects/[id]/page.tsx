"use client";

import { formatDate, formatDateTime } from "@/lib/date-format";

import * as React from "react";

import { useParams, useRouter } from "next/navigation";

import Link from "next/link";

import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Separator } from "@/components/ui/separator";

import { Skeleton } from "@/components/ui/skeleton";

import { useToast } from "@/hooks/use-toast";

import { projectApi, unitApi } from "@/lib/api";

import {
  ArrowLeft,
  Edit,
  Building2,
  MapPin,
  Calendar,
  TrendingUp,
  Home,
  Store,
} from "lucide-react";

interface ProjectData {
  id: string;
  name: string;
  location: string;
  description: string;
  type: "residential" | "commercial" | "mixed";
  totalUnits: number;
  soldUnits: number;
  availableUnits: number;
  status: "planning" | "under-construction" | "completed";
  completionPercentage: number;
  startDate: string;
  expectedCompletion: string;
}

interface Unit {
  id: string;
  unitNumber: string;
  type: string;
  floor: number;
  area: number;
  price: number;
  status: "available" | "booked" | "sold" | "reserved";
  leadName?: string;
}

function mapProject(item: any): ProjectData {
  const statusMap: Record<string, ProjectData["status"]> = {
    PLANNING: "planning",
    PLANNED: "planning",
    "UNDER_CONSTRUCTION": "under-construction",
    "UNDER-CONSTRUCTION": "under-construction",
    ONGOING: "under-construction",
    COMPLETED: "completed",
    ACTIVE: "under-construction",
  };
  const units = item.units || [];
  const sold = units.filter((u: any) => u.status === "SOLD" || u.status === "sold").length;
  const available = units.filter((u: any) => u.status === "AVAILABLE" || u.status === "available" || !u.status).length;
  const total = item.totalUnits || units.length || 0;
  return {
    id: item.id,
    name: item.name || "Project",
    location: [item.city, item.state].filter(Boolean).join(", ") || item.address || "—",
    description: item.description || "",
    type: "residential",
    totalUnits: total,
    soldUnits: sold,
    availableUnits: available,
    status: statusMap[(item.status || "").toUpperCase()] || "planning",
    completionPercentage: total > 0 ? Math.round((sold / total) * 100) : 0,
    startDate: item.startDate || item.createdAt,
    expectedCompletion: item.expectedCompletion || item.endDate || item.createdAt,
  };
}

function mapUnit(item: any): Unit {
  const status = (item.status || "available").toLowerCase();
  return {
    id: item.id,
    unitNumber: item.number || item.unitNumber || item.id.slice(-4),
    type: item.type || "—",
    floor: item.floor ?? 1,
    area: item.area ?? 0,
    price: item.price ?? 0,
    status: (["available", "booked", "sold", "reserved"].includes(status) ? status : "available") as Unit["status"],
    leadName: item.lead
      ? `${item.lead.firstName} ${item.lead.lastName}`.trim()
      : undefined,
  };
}

const statusColors: Record<string, string> = {
  available: "bg-green-100 text-green-800 border-green-300",
  booked: "bg-yellow-100 text-yellow-800 border-yellow-300",
  sold: "bg-blue-100 text-blue-800 border-blue-300",
  reserved: "bg-purple-100 text-purple-800 border-purple-300",
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
};

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [project, setProject] = React.useState<ProjectData | null>(null);
  const [units, setUnits] = React.useState<Unit[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [selectedFloor, setSelectedFloor] = React.useState<number | null>(null);

  React.useEffect(() => {
    const fetchProject = async () => {
      try {
        setIsLoading(true);
        const res = await projectApi.get(params.id as string);
        if (res.data.success && res.data.data) {
          const raw = res.data.data;
          setProject(mapProject(raw));
          const mappedUnits = (raw.units || []).map(mapUnit);
          setUnits(mappedUnits);
          if (mappedUnits.length === 0) {
            try {
              const unitRes = await unitApi.list({ projectId: params.id, limit: 200 });
              if (unitRes.data.success && unitRes.data.data) {
                setUnits(unitRes.data.data.map(mapUnit));
              }
            } catch {
              // unit list optional when project has no units relation populated
            }
          }
        } else {
          toast({ title: "Error", description: "Project not found", variant: "destructive" as any });
          router.push("/projects");
        }
      } catch {
        toast({ title: "Error", description: "Failed to load project", variant: "destructive" as any });
      } finally {
        setIsLoading(false);
      }
    };
    fetchProject();
  }, [params.id, router, toast]);

  const floors = Array.from(new Set(units.map((u) => u.floor))).sort((a, b) => a - b);

  const filteredUnits = selectedFloor
    ? units.filter((u) => u.floor === selectedFloor)
    : units;

  const availableCount = units.filter((u) => u.status === "available").length;
  const bookedCount = units.filter((u) => u.status === "booked").length;
  const soldCount = units.filter((u) => u.status === "sold").length;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/projects">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{project.name}</h1>
            <p className="text-muted-foreground flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {project.location}
            </p>
          </div>
        </div>
        <Button onClick={() => toast({ title: "Edit Project", description: "Edit project form coming soon" })}>
          <Edit className="mr-2 h-4 w-4" />
          Edit Project
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Building2 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Units</p>
                <p className="text-xl font-semibold">{project.totalUnits}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Home className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Available</p>
                <p className="text-xl font-semibold">{availableCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Calendar className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Booked</p>
                <p className="text-xl font-semibold">{bookedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Sold</p>
                <p className="text-xl font-semibold">{soldCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="inventory" className="space-y-4">
        <TabsList>
          <TabsTrigger value="inventory" className="gap-2">
            <Building2 className="h-4 w-4" />
            Unit Inventory
          </TabsTrigger>
          <TabsTrigger value="overview" className="gap-2">
            <Home className="h-4 w-4" />
            Overview
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Filter by Floor:</span>
            <Button
              variant={selectedFloor === null ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedFloor(null)}
            >
              All
            </Button>
            {floors.map((floor) => (
              <Button
                key={floor}
                variant={selectedFloor === floor ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedFloor(floor)}
              >
                Floor {floor}
              </Button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {filteredUnits.map((unit) => (
              <Card
                key={unit.id}
                className={cn("border-2", statusColors[unit.status])}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-lg">{unit.unitNumber}</span>
                    <Badge className={statusColors[unit.status]}>
                      {unit.status}
                    </Badge>
                  </div>
                  <div className="space-y-1 text-sm">
                    <p>Type: {unit.type}</p>
                    <p>Floor: {unit.floor}</p>
                    <p>Area: {unit.area} sq ft</p>
                    <p className="font-medium">{formatCurrency(unit.price)}</p>
                    {unit.leadName && (
                      <p className="text-muted-foreground">
                        Lead: {unit.leadName}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Project Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>{project.description}</p>
              <Separator />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Type</p>
                  <Badge variant="outline" className="capitalize">{project.type}</Badge>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge className="capitalize">{project.status.replace("-", " ")}</Badge>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Start Date</p>
                  <p>{formatDate(project.startDate)}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Expected Completion</p>
                  <p>{formatDate(project.expectedCompletion)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
