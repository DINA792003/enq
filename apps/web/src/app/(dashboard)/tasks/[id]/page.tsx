"use client";

import { formatDate, formatDateTime } from "@/lib/date-format";

import * as React from "react";

import { useParams, useRouter } from "next/navigation";

import Link from "next/link";

import { taskApi, ApiResponse } from "@/lib/api";

import { useToast } from "@/hooks/use-toast";

import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Separator } from "@/components/ui/separator";

import { Skeleton } from "@/components/ui/skeleton";

import {
  ArrowLeft,
  Calendar,
  User,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  History,
  StickyNote,
} from "lucide-react";

interface TaskData {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  priority: string;
  status: string;
  assignedTo?: string;
  relatedTo?: string;
  relatedType?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info"> = {
  low: "secondary",
  medium: "info",
  high: "warning",
  urgent: "destructive",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info"> = {
  pending: "info",
  "in-progress": "warning",
  completed: "success",
  cancelled: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  "in-progress": "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const PRIORITY_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [task, setTask] = React.useState<TaskData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState("details");

  React.useEffect(() => {
    const fetchTask = async () => {
      try {
        setIsLoading(true);
        const res = await taskApi.get(params.id as string);
        if (res.data.success && res.data.data) {
          setTask(res.data.data);
        } else {
          toast({ title: "Error", description: "Task not found", variant: "destructive" as any });
          router.push("/tasks");
        }
      } catch {
        toast({ title: "Error", description: "Failed to load task", variant: "destructive" as any });
      } finally {
        setIsLoading(false);
      }
    };
    fetchTask();
  }, [params.id, router, toast]);

  const handleComplete = async () => {
    try {
      const res = await taskApi.updateStatus(params.id as string, "COMPLETED");
      if (res.data.success) {
        toast({ title: "Success", description: "Task marked as completed" });
        setTask((prev) => (prev ? { ...prev, status: "completed", completedAt: new Date().toISOString() } : prev));
      }
    } catch {
      toast({ title: "Error", description: "Failed to complete task", variant: "destructive" as any });
    }
  };

  const handleReopen = async () => {
    try {
      const res = await taskApi.updateStatus(params.id as string, "PENDING");
      if (res.data.success) {
        toast({ title: "Success", description: "Task reopened" });
        setTask((prev) => (prev ? { ...prev, status: "pending", completedAt: undefined } : prev));
      }
    } catch {
      toast({ title: "Error", description: "Failed to reopen task", variant: "destructive" as any });
    }
  };

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
        <div className="grid gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
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

  if (!task) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/tasks">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{task.title}</h1>
            <p className="text-muted-foreground">Task #{task.id}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {task.status !== "completed" ? (
            <Button onClick={handleComplete}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Mark Complete
            </Button>
          ) : (
            <Button variant="outline" onClick={handleReopen}>
              <Clock className="mr-2 h-4 w-4" />
              Reopen
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={STATUS_VARIANT[task.status] || "default"}>
                  {STATUS_LABEL[task.status] || task.status}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Priority</p>
                <Badge variant={PRIORITY_VARIANT[task.priority] || "default"}>
                  {PRIORITY_LABEL[task.priority] || task.priority}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Calendar className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Due Date</p>
                <p className="text-sm font-medium">
                  {task.dueDate
                    ? formatDate(task.dueDate)
                    : "Not set"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <User className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Assigned To</p>
                <p className="text-sm font-medium">{task.assignedTo || "Unassigned"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="details" className="gap-2">
            <FileText className="h-4 w-4" />
            Details
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <History className="h-4 w-4" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="notes" className="gap-2">
            <StickyNote className="h-4 w-4" />
            Notes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Task Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Title</span>
                  <span className="text-sm font-medium">{task.title}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={STATUS_VARIANT[task.status] || "default"}>
                    {STATUS_LABEL[task.status] || task.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Priority</span>
                  <Badge variant={PRIORITY_VARIANT[task.priority] || "default"}>
                    {PRIORITY_LABEL[task.priority] || task.priority}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Assigned To</span>
                  <span className="text-sm font-medium">{task.assignedTo || "Unassigned"}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Timeline
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Created</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(task.createdAt)}
                    </p>
                  </div>
                </div>
                {task.dueDate && (
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Due Date</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(task.dueDate)}
                      </p>
                    </div>
                  </div>
                )}
                {task.completedAt && (
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <div>
                      <p className="text-sm font-medium">Completed</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(task.completedAt)}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {task.relatedTo && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Related To
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Record</span>
                  <span className="text-sm font-medium">{task.relatedTo}</span>
                </div>
                {task.relatedType && (
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm text-muted-foreground">Type</span>
                    <Badge variant="outline" className="capitalize">{task.relatedType}</Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {task.description && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Description
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{task.description}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No activity recorded</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <StickyNote className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No notes added</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
