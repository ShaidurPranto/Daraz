"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuthStore } from "@/lib/authStore";
import { toast } from "sonner";
import { ArrowLeft, ChevronRight, HeadphonesIcon } from "lucide-react";
import {
  adminFetchSupportTickets,
  type AdminSupportTicket,
  type TicketStatus,
} from "@/lib/api";

const STATUS_STYLES: Record<TicketStatus, string> = {
  open: "bg-yellow-100 text-yellow-800",
  in_progress: "bg-blue-100 text-blue-800",
  closed: "bg-gray-100 text-gray-600",
};

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  closed: "Closed",
};

const FILTERS: { label: string; value: TicketStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Open", value: "open" },
  { label: "In Progress", value: "in_progress" },
  { label: "Closed", value: "closed" },
];

export default function AdminSupportPage() {
  const router = useRouter();
  const { user, isLoggedIn, hasInitialized, initializeFromStorage } = useAuthStore();

  const [tickets, setTickets] = useState<AdminSupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TicketStatus | "all">("all");

  useEffect(() => {
    if (!hasInitialized) initializeFromStorage();
  }, []);

  useEffect(() => {
    if (!hasInitialized) return;
    if (!isLoggedIn || !user?.is_admin) { router.push("/admin-login"); return; }
    load(filter);
  }, [hasInitialized, isLoggedIn, user?.is_admin, router]);

  const load = (f: TicketStatus | "all") => {
    setLoading(true);
    adminFetchSupportTickets(f === "all" ? undefined : f)
      .then(setTickets)
      .catch(() => toast.error("Failed to load tickets"))
      .finally(() => setLoading(false));
  };

  const handleFilter = (f: TicketStatus | "all") => {
    setFilter(f);
    load(f);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-1 h-4 w-4" /> Dashboard
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <HeadphonesIcon className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold text-gray-900">Support Tickets</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Filter tabs */}
        <div className="mb-6 flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => handleFilter(f.value)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                filter === f.value
                  ? "bg-primary text-white"
                  : "bg-white text-gray-600 border hover:bg-gray-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : tickets.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <HeadphonesIcon className="mx-auto mb-4 h-10 w-10 text-gray-300" />
              <p className="text-gray-500">No tickets found.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {tickets.map((ticket) => (
              <Link key={ticket.id} href={`/admin/support/${ticket.id}`}>
                <Card className="cursor-pointer transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-gray-900">{ticket.subject}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {ticket.user_name} · {ticket.user_email}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {ticket.message_count ?? 0} message{(ticket.message_count ?? 0) !== 1 ? "s" : ""} ·{" "}
                        Last updated {new Date(ticket.updated_at).toLocaleDateString("en-BD", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="ml-4 flex items-center gap-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[ticket.status as TicketStatus]}`}>
                        {STATUS_LABELS[ticket.status as TicketStatus]}
                      </span>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
