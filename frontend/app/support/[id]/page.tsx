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
  fetchUserTicketById,
  sendUserSupportMessage,
  type SupportTicketDetail,
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

export default function UserTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { user, isLoggedIn, hasInitialized, initializeFromStorage } = useAuthStore();

  const [ticketId, setTicketId] = useState("");
  const [detail, setDetail] = useState<SupportTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [showImageInput, setShowImageInput] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasInitialized) initializeFromStorage();
  }, []);

  useEffect(() => {
    params.then(({ id }) => setTicketId(id));
  }, [params]);

  useEffect(() => {
    if (!hasInitialized || !ticketId) return;
    if (!isLoggedIn) { router.push("/login"); return; }

    fetchUserTicketById(ticketId)
      .then(setDetail)
      .catch(() => toast.error("Ticket not found"))
      .finally(() => setLoading(false));
  }, [hasInitialized, isLoggedIn, ticketId, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() && !imageUrl.trim()) {
      toast.error("Enter a message or image URL");
      return;
    }
    setSending(true);
    try {
      const msg: SupportMessage = await sendUserSupportMessage(
        ticketId,
        message.trim() || null,
        imageUrl.trim() || null,
      );
      setDetail((prev) =>
        prev ? { ...prev, messages: [...prev.messages, msg] } : prev,
      );
      setMessage("");
      setImageUrl("");
      setShowImageInput(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-gray-500">Ticket not found.</p>
        <Link href="/support"><Button className="mt-4">Back to Support</Button></Link>
      </div>
    );
  }

  const { ticket, messages } = detail;
  const isClosed = ticket.status === "closed";

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <Link href="/support">
          <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-gray-900">{ticket.subject}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[ticket.status as TicketStatus]}`}>
              {STATUS_LABELS[ticket.status as TicketStatus]}
            </span>
            <span className="text-xs text-gray-400">
              Opened {new Date(ticket.created_at).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <Card className="mb-4">
        <CardContent className="space-y-4 py-6 max-h-[60vh] overflow-y-auto">
          {messages.map((msg) => {
            const isOwnMessage = msg.sender_id === user?.id;
            return (
              <div key={msg.id} className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] space-y-1 ${isOwnMessage ? "items-end" : "items-start"} flex flex-col`}>
                  <p className={`text-xs font-medium ${isOwnMessage ? "text-right text-primary" : "text-gray-500"}`}>
                    {msg.is_admin ? "Support Team" : "You"}
                  </p>
                  <div className={`rounded-2xl px-4 py-2.5 ${
                    isOwnMessage
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
                  <p className="text-xs text-gray-400">
                    {new Date(msg.created_at).toLocaleString("en-BD", { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </CardContent>
      </Card>

      {/* Reply box */}
      {isClosed ? (
        <Card>
          <CardContent className="py-4 text-center text-sm text-gray-500">
            This ticket is closed. <Link href="/support" className="text-primary underline">Open a new ticket</Link> if you need further help.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Reply</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSend} className="space-y-3">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message..."
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
                  {sending ? "Sending..." : "Send"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Add image URL"
                  onClick={() => setShowImageInput((v) => !v)}
                >
                  <ImageIcon className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
