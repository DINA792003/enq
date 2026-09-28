"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/crm/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Download, MoreHorizontal, Eye, Edit, Trash2, Send } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { quotationApi } from "@/lib/api";

interface Quotation {
  id: string;
  quotationNumber: string;
  leadName: string;
  projectName: string;
  amount: number;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  validUntil: string;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  sent: "bg-blue-100 text-blue-800",
  accepted: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  expired: "bg-orange-100 text-orange-800",
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

const columns: ColumnDef<Quotation>[] = [
  {
    accessorKey: "quotationNumber",
    header: "Quotation #",
    cell: ({ row }) => (
      <Link href={`/quotations/${row.original.id}`} className="hover:underline font-medium">
        {row.getValue("quotationNumber")}
      </Link>
    ),
  },
  {
    accessorKey: "leadName",
    header: "Lead",
  },
  {
    accessorKey: "projectName",
    header: "Project",
  },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row }) => (
      <span className="font-medium">{formatCurrency(row.getValue("amount") as number)}</span>
    ),
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
    accessorKey: "validUntil",
    header: "Valid Until",
    cell: ({ row }) => formatDate(row.getValue("validUntil") as string),
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const quotation = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/quotations/${quotation.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                View
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Send className="mr-2 h-4 w-4" />
              Send
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Download className="mr-2 h-4 w-4" />
              Download PDF
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

export default function QuotationsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = React.useState(1);
  const [quotations, setQuotations] = React.useState<Quotation[]>([]);
  const [totalItems, setTotalItems] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchQuotations = async () => {
      try {
        setIsLoading(true);
        const res = await quotationApi.list({ page: currentPage, limit: 20 });
        if (res.data.success && res.data.data) {
          const mapped = res.data.data.map((item: any) => ({
            id: item.id,
            quotationNumber: item.number || item.id.slice(-8).toUpperCase(),
            leadName: item.lead
              ? `${item.lead.firstName} ${item.lead.lastName}`.trim()
              : "—",
            projectName: item.project?.name || "—",
            amount: item.totalAmount || 0,
            status: (item.status || "draft").toLowerCase() as Quotation["status"],
            validUntil: item.validUntil || item.createdAt,
            createdAt: item.createdAt,
          }));
          setQuotations(mapped);
          setTotalItems(res.data.pagination?.total ?? mapped.length);
        } else {
          setQuotations([]);
          setTotalItems(0);
        }
      } catch {
        toast({ title: "Error", description: "Failed to load quotations", variant: "destructive" as any });
        setQuotations([]);
        setTotalItems(0);
      } finally {
        setIsLoading(false);
      }
    };
    fetchQuotations();
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
          <h1 className="text-xl font-semibold">Quotations</h1>
          <p className="text-muted-foreground">
            Create and manage sales quotations
          </p>
        </div>
        <Button onClick={() => toast({ title: "New Quotation", description: "Create quotation form coming soon" })}>
          <Plus className="mr-2 h-4 w-4" />
          New Quotation
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={quotations}
        searchKey="quotationNumber"
        searchPlaceholder="Search by quotation number..."
          totalItems={totalItems}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          serverPagination
        />
    </div>
  );
}
