"use client";

import { formatDate, formatDateTime } from "@/lib/date-format";

import * as React from "react";

import { useParams, useRouter } from "next/navigation";

import Link from "next/link";

import { bookingApi } from "@/lib/api";

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
  DollarSign,
  Home,
  User,
  CheckCircle2,
  XCircle,
  FileText,
  History,
  StickyNote,
} from "lucide-react";

interface BookingData {
  id: string;
  bookingNumber: string;
  leadName: string;
  projectName: string;
  unitNumber: string;
  amount: number;
  status: string;
  bookingDate: string;
  paymentStatus: string;
  createdAt: string;
  updatedAt: string;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info"> = {
  pending: "warning",
  confirmed: "success",
  cancelled: "destructive",
  completed: "info",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
};

const PAYMENT_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info"> = {
  pending: "warning",
  partial: "info",
  complete: "success",
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  partial: "Partial",
  complete: "Complete",
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
};

export default function BookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [booking, setBooking] = React.useState<BookingData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState("details");

  React.useEffect(() => {
    const fetchBooking = async () => {
      try {
        setIsLoading(true);
        const res = await bookingApi.get(params.id as string);
        if (res.data.success && res.data.data) {
          setBooking(res.data.data);
        } else {
          toast({ title: "Error", description: "Booking not found", variant: "destructive" as any });
          router.push("/bookings");
        }
      } catch {
        toast({ title: "Error", description: "Failed to load booking", variant: "destructive" as any });
      } finally {
        setIsLoading(false);
      }
    };
    fetchBooking();
  }, [params.id, router, toast]);

  const handleConfirm = async () => {
    try {
      const res = await bookingApi.confirm(params.id as string);
      if (res.data.success) {
        toast({ title: "Success", description: "Booking confirmed" });
        setBooking((prev) => (prev ? { ...prev, status: "confirmed" } : prev));
      }
    } catch {
      toast({ title: "Error", description: "Failed to confirm booking", variant: "destructive" as any });
    }
  };

  const handleCancel = async () => {
    try {
      const res = await bookingApi.cancel(params.id as string, "Cancelled by admin");
      if (res.data.success) {
        toast({ title: "Success", description: "Booking cancelled" });
        setBooking((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
      }
    } catch {
      toast({ title: "Error", description: "Failed to cancel booking", variant: "destructive" as any });
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

  if (!booking) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/bookings">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{booking.bookingNumber}</h1>
            <p className="text-muted-foreground">Booking for {booking.leadName}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {booking.status === "pending" && (
            <>
              <Button onClick={handleConfirm}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Confirm
              </Button>
              <Button variant="destructive" onClick={handleCancel}>
                <XCircle className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Amount</p>
                <p className="text-lg font-bold">{formatCurrency(booking.amount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={STATUS_VARIANT[booking.status] || "default"}>
                  {STATUS_LABEL[booking.status] || booking.status}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Home className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unit</p>
                <p className="text-sm font-medium">{booking.unitNumber}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Calendar className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Booking Date</p>
                <p className="text-sm font-medium">
                  {formatDate(booking.bookingDate)}
                </p>
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
                  Booking Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Booking Number</span>
                  <span className="text-sm font-medium">{booking.bookingNumber}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Lead</span>
                  <span className="text-sm font-medium">{booking.leadName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Project</span>
                  <span className="text-sm font-medium">{booking.projectName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Unit</span>
                  <span className="text-sm font-medium">{booking.unitNumber}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Amount</span>
                  <span className="text-sm font-bold">{formatCurrency(booking.amount)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={STATUS_VARIANT[booking.status] || "default"}>
                    {STATUS_LABEL[booking.status] || booking.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Payment Status</span>
                  <Badge variant={PAYMENT_STATUS_VARIANT[booking.paymentStatus] || "default"}>
                    {PAYMENT_STATUS_LABEL[booking.paymentStatus] || booking.paymentStatus}
                  </Badge>
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
                    <p className="text-sm font-medium">Booking Date</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(booking.bookingDate)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Created</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(booking.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Last Updated</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(booking.updatedAt)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
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
