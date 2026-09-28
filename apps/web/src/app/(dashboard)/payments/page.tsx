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
  const [currentPage, setCurrentPage] = React.useState(1);
  const [payments, setPayments] = React.useState<Payment[]>([]);
  const [totalItems, setTotalItems] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);

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
          <Button onClick={() => toast({ title: "Record Payment", description: "Record payment form coming soon" })}>
            <Plus className="mr-2 h-4 w-4" />
            Record Payment
          </Button>
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
    </div>
  );
}
