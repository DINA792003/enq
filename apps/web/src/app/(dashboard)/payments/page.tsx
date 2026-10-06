"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/crm/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Download, MoreHorizontal, Eye, Receipt } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { paymentApi } from "@/lib/api";
import { bookingApi } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Payment {
  id: string;
  paymentNumber: string;
  leadName: string;
  bookingNumber: string;
  bookingId?: string;
  amount: number;
  method: string;
  status: "pending" | "completed" | "failed" | "refunded";
  paymentDate: string;
  reference?: string;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  refunded: "bg-purple-100 text-purple-800",
};

const methodColors: Record<string, string> = {
  cash: "bg-green-100 text-green-800",
  cheque: "bg-blue-100 text-blue-800",
  online: "bg-purple-100 text-purple-800",
  emi: "bg-orange-100 text-orange-800",
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
};

const formatDate = (value: string) => {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
};

const columns: ColumnDef<Payment>[] = [
  {
    accessorKey: "paymentNumber",
    header: "Payment #",
    cell: ({ row }) => (
      <Link href={`/payments/${row.original.id}`} className="hover:underline font-medium">
        {row.getValue("paymentNumber")}
      </Link>
    ),
  },
  {
    accessorKey: "leadName",
    header: "Lead",
  },
  {
    accessorKey: "bookingNumber",
    header: "Booking",
    cell: ({ row }) =>
      row.original.bookingId ? (
        <Link href={`/bookings/${row.original.bookingId}`} className="hover:underline">
          {row.getValue("bookingNumber")}
        </Link>
      ) : (
        <span>{row.getValue("bookingNumber")}</span>
      ),
  },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row }) => (
      <span className="font-medium">{formatCurrency(row.getValue("amount") as number)}</span>
    ),
  },
  {
    accessorKey: "method",
    header: "Method",
    cell: ({ row }) => {
      const method = row.getValue("method") as string;
      return (
        <Badge className={methodColors[method] || "bg-gray-100 text-gray-800"}>
          {method}
        </Badge>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      return (
        <Badge className={statusColors[status]}>
          {status}
        </Badge>
      );
    },
  },
  {
    accessorKey: "paymentDate",
    header: "Date",
    cell: ({ row }) => formatDate(row.getValue("paymentDate") as string),
  },
  {
    accessorKey: "reference",
    header: "Reference",
    cell: ({ row }) => row.getValue("reference") || "-",
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const payment = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/payments/${payment.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                View
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Receipt className="mr-2 h-4 w-4" />
              Receipt
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Download className="mr-2 h-4 w-4" />
              Download
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

export default function PaymentsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { hasEffectivePermission } = useAuth();
  const [currentPage, setCurrentPage] = React.useState(1);
  const [payments, setPayments] = React.useState<Payment[]>([]);
  const [totalItems, setTotalItems] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [recordPaymentOpen, setRecordPaymentOpen] = React.useState(false);
  const [isSavingPayment, setIsSavingPayment] = React.useState(false);
  const [isLoadingBookings, setIsLoadingBookings] = React.useState(false);
  const [availableBookings, setAvailableBookings] = React.useState<any[]>([]);
  const [paymentBookingId, setPaymentBookingId] = React.useState("");
  const [paymentAmount, setPaymentAmount] = React.useState("");
  const [paymentDate, setPaymentDate] = React.useState("");
  const [paymentReference, setPaymentReference] = React.useState("");
  const [paymentNotes, setPaymentNotes] = React.useState("");

  const openRecordPayment = async () => {
    setIsLoadingBookings(true);
    try {
      const response = await bookingApi.list({ page: 1, limit: 100 });
      const bookings = (response.data.data || []).filter(
        (booking: any) => !["CANCELLED", "COMPLETED"].includes(booking.status),
      );
      setAvailableBookings(bookings);
      setPaymentBookingId("");
      setRecordPaymentOpen(true);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.response?.data?.error || "Failed to load accessible bookings",
        variant: "destructive" as any,
      });
    } finally {
      setIsLoadingBookings(false);
    }
  };

  const handleRecordPayment = async () => {
    const amount = Number(paymentAmount);
    if (!paymentBookingId || !Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Validation", description: "Select a booking and enter a valid amount", variant: "destructive" as any });
      return;
    }

    setIsSavingPayment(true);
    try {
      const response = await paymentApi.create({
        bookingId: paymentBookingId,
        amount,
        paymentDate: paymentDate ? new Date(`${paymentDate}T00:00:00`).toISOString() : undefined,
        reference: paymentReference.trim() || undefined,
        notes: paymentNotes.trim() || undefined,
      });
      const created = response.data.data;
      const booking = availableBookings.find((item) => item.id === paymentBookingId);
      const payment: Payment = {
        id: created.id,
        paymentNumber: created.reference || created.id.slice(-8).toUpperCase(),
        leadName: booking?.lead
          ? `${booking.lead.firstName} ${booking.lead.lastName}`.trim()
          : "—",
        bookingNumber: booking?.number || "—",
        bookingId: booking?.id,
        amount: created.amount,
        method: "online",
        status: (created.status || "PENDING").toLowerCase() as Payment["status"],
        paymentDate: created.paymentDate || created.createdAt,
        reference: created.reference,
      };
      setPayments((items) => [payment, ...items].slice(0, 20));
      setTotalItems((total) => total + 1);
      setRecordPaymentOpen(false);
      setPaymentAmount("");
      setPaymentDate("");
      setPaymentReference("");
      setPaymentNotes("");
      toast({ title: "Success", description: "Payment recorded successfully" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.response?.data?.error || "Failed to record payment",
        variant: "destructive" as any,
      });
    } finally {
      setIsSavingPayment(false);
    }
  };

  React.useEffect(() => {
    const fetchPayments = async () => {
      try {
        setIsLoading(true);
        const res = await paymentApi.list({ page: currentPage, limit: 20 });
        if (res.data.success && res.data.data) {
          const mapped = res.data.data.map((item: any) => ({
            id: item.id,
            paymentNumber: item.reference || item.id.slice(-8).toUpperCase(),
            leadName: item.booking?.lead
              ? `${item.booking.lead.firstName} ${item.booking.lead.lastName}`.trim()
              : "—",
            bookingNumber: item.booking?.number || "—",
            bookingId: item.booking?.id,
            amount: item.amount || 0,
            method: (item.method || "online").toLowerCase(),
            status: (item.status || "pending").toLowerCase() as Payment["status"],
            paymentDate: item.paymentDate || item.createdAt,
            reference: item.reference,
          }));
          setPayments(mapped);
          setTotalItems(res.data.pagination?.total ?? mapped.length);
        } else {
          setPayments([]);
          setTotalItems(0);
        }
      } catch {
        toast({ title: "Error", description: "Failed to load payments", variant: "destructive" as any });
        setPayments([]);
        setTotalItems(0);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPayments();
  }, [currentPage, toast]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-32" />
          </div>
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
          <h1 className="text-xl font-semibold">Payments</h1>
          <p className="text-muted-foreground">
            Track and manage all payments
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => toast({ title: "Export", description: "Export feature coming soon" })}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          {hasEffectivePermission("PAYMENT_CREATE") && (
            <Button onClick={openRecordPayment} disabled={isLoadingBookings}>
              <Plus className="mr-2 h-4 w-4" />
              {isLoadingBookings ? "Loading bookings..." : "Record Payment"}
            </Button>
          )}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={payments}
        searchKey="paymentNumber"
        searchPlaceholder="Search by payment number..."
          totalItems={totalItems}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          serverPagination
        />

        <Dialog open={recordPaymentOpen} onOpenChange={setRecordPaymentOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Payment</DialogTitle>
              <DialogDescription>Select an accessible active booking and enter its payment details.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="payment-booking">Booking *</Label>
                <Select value={paymentBookingId} onValueChange={setPaymentBookingId}>
                  <SelectTrigger id="payment-booking" disabled={availableBookings.length === 0}>
                    <SelectValue placeholder="Select a booking" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBookings.map((booking) => (
                      <SelectItem key={booking.id} value={booking.id}>
                        {booking.number} · {booking.project?.name || "Project"} · Unit {booking.unit?.number || "—"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {availableBookings.length === 0 && (
                  <p className="text-sm text-muted-foreground">No accessible active bookings are available.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-amount">Amount *</Label>
                <Input id="payment-amount" type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-date">Payment Date</Label>
                <Input id="payment-date" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-reference">Reference</Label>
                <Input id="payment-reference" maxLength={200} value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-notes">Notes</Label>
                <Textarea id="payment-notes" maxLength={2000} value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRecordPaymentOpen(false)} disabled={isSavingPayment}>Cancel</Button>
              <Button onClick={handleRecordPayment} disabled={isSavingPayment || !availableBookings.length}>
                {isSavingPayment ? "Recording..." : "Record Payment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
}
