"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/lib/authStore";
import { toast } from "sonner";
import { ArrowLeft, Send, ImageIcon } from "lucide-react";
import {
  adminFetchTicketById,
  adminReplySupportTicket,
  adminUpdateTicketStatus,
  type AdminSupportTicketDetail,
  type SupportMessage,
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

export default function AdminTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { user, isLoggedIn, hasInitialized, initializeFromStorage } = useAuthStore();

  const [ticketId, setTicketId] = useState("");
  const [detail, setDetail] = useState<AdminSupportTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [showImageInput, setShowImageInput] = useState(false);
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasInitialized) initializeFromStorage();
  }, []);

  useEffect(() => {
    params.then(({ id }) => setTicketId(id));
  }, [params]);

  useEffect(() => {
    if (!hasInitialized || !ticketId) return;
    if (!isLoggedIn || !user?.is_admin) { router.push("/admin-login"); return; }
    load();
  }, [hasInitialized, isLoggedIn, user?.is_admin, ticketId, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages]);

  const load = () => {
    adminFetchTicketById(ticketId)
      .then(setDetail)
      .catch(() => toast.error("Ticket not found"))
      .finally(() => setLoading(false));
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() && !imageUrl.trim()) {
      toast.error("Enter a message or image URL");
      return;
    }
    setSending(true);
    try {
      const msg: SupportMessage = await adminReplySupportTicket(
        ticketId,
        message.trim() || null,
        imageUrl.trim() || null,
      );
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              ticket: { ...prev.ticket, status: prev.ticket.status === "open" ? "in_progress" : prev.ticket.status },
              messages: [...prev.messages, msg],
            }
          : prev,
      );
      setMessage("");
      setImageUrl("");
      setShowImageInput(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (newStatus: TicketStatus) => {
    setUpdatingStatus(true);
    try {
      const updated = await adminUpdateTicketStatus(ticketId, newStatus);
      setDetail((prev) =>
        prev ? { ...prev, ticket: { ...prev.ticket, status: updated.status } } : prev,
      );
      toast.success(`Ticket marked as ${STATUS_LABELS[newStatus]}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-8 text-center text-gray-500">
        Ticket not found.{" "}
        <Link href="/admin/support" className="text-primary underline">Back to tickets</Link>
      </div>
    );
  }

  const { ticket, messages } = detail;
  const currentStatus = ticket.status as TicketStatus;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Link href="/admin/support">
              <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-gray-900">{ticket.subject}</h1>
              <p className="text-sm text-gray-500">
                From: <span className="font-medium">{ticket.user_name}</span> · {ticket.user_email}
                {ticket.user_phone && ` · ${ticket.user_phone}`}
              </p>
            </div>
          </div>

          {/* Status controls */}
          <div className="ml-4 flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[currentStatus]}`}>
              {STATUS_LABELS[currentStatus]}
            </span>
            {currentStatus !== "closed" && (
              <Button
                size="sm"
                variant="outline"
                disabled={updatingStatus}
                onClick={() => handleStatusChange(currentStatus === "open" ? "in_progress" : "closed")}
              >
                {updatingStatus
                  ? "..."
                  : currentStatus === "open"
                    ? "Mark In Progress"
                    : "Mark Closed"}
              </Button>
            )}
            {currentStatus === "closed" && (
              <Button size="sm" variant="outline" disabled={updatingStatus} onClick={() => handleStatusChange("open")}>
                {updatingStatus ? "..." : "Reopen"}
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        {/* Messages */}
        <Card>
          <CardContent className="space-y-4 py-6 max-h-[62vh] overflow-y-auto">
            {messages.map((msg) => {
              const isAdmin = msg.is_admin;
              return (
                <div key={msg.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] flex flex-col ${isAdmin ? "items-end" : "items-start"}`}>
                    <p className={`text-xs font-medium mb-1 ${isAdmin ? "text-right text-primary" : "text-gray-500"}`}>
                      {isAdmin ? "Support Team (You)" : msg.sender_name}
                    </p>
                    <div className={`rounded-2xl px-4 py-2.5 ${
                      isAdmin
                        ? "bg-primary text-white rounded-tr-none"
                        : "bg-gray-100 text-gray-900 rounded-tl-none"
                    }`}>
                      {msg.message && <p className="text-sm whitespace-pre-wrap">{msg.message}</p>}
                      {msg.image_url && (
                        <div className="mt-2">
                          <a href={msg.image_url} target="_blank" rel="noreferrer">
                            <div className="relative h-40 w-60 overflow-hidden rounded-lg">
                              <Image
                                src={msg.image_url}
                                alt="attachment"
                                fill
                                sizes="240px"
                                className="object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                            </div>
                          </a>
                        </div>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-400">
                      {new Date(msg.created_at).toLocaleString("en-BD", {
                        hour: "2-digit", minute: "2-digit", month: "short", day: "numeric",
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </CardContent>
        </Card>

        {/* Reply box */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Reply to User</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSend} className="space-y-3">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your response..."
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              />
              {showImageInput && (
                <Input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="Paste image URL (https://...)"
                  type="url"
                />
              )}
              <div className="flex items-center gap-2">
                <Button type="submit" disabled={sending} className="flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  {sending ? "Sending..." : "Send Reply"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Attach image URL"
                  onClick={() => setShowImageInput((v) => !v)}
                >
                  <ImageIcon className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
