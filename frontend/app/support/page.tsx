"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuthStore } from "@/lib/authStore";
import { toast } from "sonner";
import { Plus, ChevronRight, HeadphonesIcon } from "lucide-react";
import {
  fetchUserSupportTickets,
  createSupportTicket,
  type SupportTicket,
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

export default function SupportPage() {
  const router = useRouter();
  const { user, isLoggedIn, hasInitialized, initializeFromStorage } = useAuthStore();

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    if (!hasInitialized) initializeFromStorage();
  }, []);

  useEffect(() => {
    if (!hasInitialized) return;
    if (!isLoggedIn) { router.push("/login"); return; }
    if (user?.is_admin) { router.push("/admin/support"); return; }
    fetchUserSupportTickets()
      .then(setTickets)
      .catch(() => toast.error("Failed to load tickets"))
      .finally(() => setLoading(false));
  }, [hasInitialized, isLoggedIn, user?.is_admin, router]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      toast.error("Subject and message are required");
      return;
    }
    setSubmitting(true);
    try {
      const ticket = await createSupportTicket(subject.trim(), message.trim(), imageUrl.trim() || null);
      setTickets((prev) => [{ ...ticket, message_count: 1 }, ...prev]);
      setShowForm(false);
      setSubject(""); setMessage(""); setImageUrl("");
      toast.success("Ticket created! We'll get back to you soon.");
      router.push(`/support/${ticket.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create ticket");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HeadphonesIcon className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Support</h1>
            <p className="text-sm text-gray-500">Get help from our team</p>
          </div>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          New Ticket
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Open a Support Ticket</CardTitle>
            <CardDescription>Describe your issue and we will respond as soon as possible</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Subject</label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief description of your issue"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Explain your problem in detail..."
                  rows={4}
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  Image URL <span className="text-gray-400">(Optional — paste a screenshot link)</span>
                </label>
                <Input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://example.com/screenshot.png"
                  type="url"
                />
              </div>
              <div className="flex gap-3">
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit Ticket"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Ticket list */}
      {tickets.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <HeadphonesIcon className="mx-auto mb-4 h-10 w-10 text-gray-300" />
            <p className="text-gray-500">No support tickets yet.</p>
            <p className="text-sm text-gray-400">Click &quot;New Ticket&quot; to get help.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <Link key={ticket.id} href={`/support/${ticket.id}`}>
              <Card className="cursor-pointer transition-shadow hover:shadow-md">
                <CardContent className="flex items-center justify-between py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-gray-900">{ticket.subject}</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {ticket.message_count ?? 0} message{(ticket.message_count ?? 0) !== 1 ? "s" : ""} ·{" "}
                      {new Date(ticket.updated_at).toLocaleDateString("en-BD", {
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
    </div>
  );
}
