"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { useAuthStore } from "@/lib/authStore";
import {
  fetchAdminOrderById,
  updateAdminOrderStatus,
  type AdminOrderDetails,
} from "@/lib/api";

const VALID_TRANSITIONS: Record<string, Record<string, string[]>> = {
  "Cash on Delivery": {
    Pending: ["Confirmed", "Canceled"],
    Confirmed: ["Delivered"],
  },
  "Online Payment": {
    Paid: ["Delivered"],
  },
};

const getStatusColor = (status: string) => {
  switch (status?.toLowerCase()) {
    case "delivered":
      return "bg-green-100 text-green-700 border-green-200";
    case "paid":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "confirmed":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "pending":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "failed":
    case "canceled":
      return "bg-red-100 text-red-700 border-red-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
};

export default function AdminOrderDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { user, isLoggedIn, hasInitialized, initializeFromStorage } =
    useAuthStore();

  const [resolvedId, setResolvedId] = useState<string>("");
  const [order, setOrder] = useState<AdminOrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!hasInitialized) {
      initializeFromStorage();
    }
  }, [hasInitialized, initializeFromStorage]);

  useEffect(() => {
    (async () => {
      const { id } = await params;
      setResolvedId(id);
    })();
  }, [params]);

  useEffect(() => {
    if (!hasInitialized || !resolvedId) return;
    if (!isLoggedIn || !user?.is_admin) {
      router.push("/admin-login");
      return;
    }

    const loadOrder = async () => {
      setLoading(true);
      try {
        const data = await fetchAdminOrderById(resolvedId);
        setOrder(data);
        setSelectedStatus("");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to load order details",
        );
      } finally {
        setLoading(false);
      }
    };

    void loadOrder();
  }, [hasInitialized, isLoggedIn, router, user?.is_admin, resolvedId]);

  const getNextStatuses = (): string[] => {
    if (!order) return [];
    const transitions = VALID_TRANSITIONS[order.payment_method];
    if (!transitions) return [];
    return transitions[order.order_status] || [];
  };

  const handleStatusUpdate = async () => {
    if (!order || !selectedStatus || selectedStatus === order.order_status)
      return;

    try {
      setUpdating(true);
      await updateAdminOrderStatus(order.id, selectedStatus);
      toast.success(`Order status updated to "${selectedStatus}"`);
      // Refresh order data
      const data = await fetchAdminOrderById(resolvedId);
      setOrder(data);
      setSelectedStatus("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update order status",
      );
      setSelectedStatus("");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500">
        Loading order details...
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-8 text-center text-gray-500">Order not found.</div>
    );
  }

  const nextStatuses = getNextStatuses();
  const canUpdateStatus = nextStatuses.length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/admin/orders">
              <Button variant="outline" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Order Details
              </h1>
              <p className="text-sm text-gray-600">Order ID: {order.id}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-3 lg:px-8">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {order.order_items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 border-b pb-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="relative h-16 w-16 overflow-hidden rounded bg-gray-100">
                      {item.image_url ? (
                        <Image
                          src={item.image_url}
                          alt={item.product_name}
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      ) : null}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {item.product_name}
                      </p>
                      <p className="text-sm text-gray-500">
                        Brand: {item.brand || "-"}
                      </p>
                      <p className="text-sm text-gray-500">
                        Qty: {item.quantity}
                      </p>
                    </div>
                  </div>
                  <p className="font-semibold">
                    ৳ {item.price.toLocaleString()}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Status Update Card */}
          <Card className="border-2 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Update Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-gray-500 mb-2">Current Status</p>
                <span
                  className={`inline-block px-3 py-1.5 rounded-full text-xs uppercase font-bold tracking-wider border ${getStatusColor(order.order_status)}`}
                >
                  {order.order_status}
                </span>
              </div>

              {canUpdateStatus ? (
                <>
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-1.5">
                      Update to
                    </p>
                    <Combobox
                      items={nextStatuses}
                      value={selectedStatus || null}
                      onValueChange={(value) => {
                        setSelectedStatus((value as string) || "");
                      }}
                    >
                      <ComboboxInput
                        className="w-full"
                        id="statusSelect"
                        placeholder="Select new status..."
                      />
                      <ComboboxContent>
                        <ComboboxEmpty>No statuses available.</ComboboxEmpty>
                        <ComboboxList>
                          {(status: string) => (
                            <ComboboxItem key={status} value={status}>
                              {status}
                            </ComboboxItem>
                          )}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                  </div>
                  <Button
                    onClick={handleStatusUpdate}
                    disabled={updating || !selectedStatus}
                    className="w-full bg-primary hover:bg-primary/90 text-white gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {updating ? "Updating..." : "Save Status"}
                  </Button>
                </>
              ) : (
                <p className="text-sm text-gray-500 italic">
                  {order.order_status === "Delivered"
                    ? "This order has been delivered. No further updates available."
                    : order.order_status === "Failed" || order.order_status === "Canceled"
                      ? "This order has been cancelled/failed. No updates available."
                      : order.order_status === "Pending" &&
                        order.payment_method === "Online Payment"
                        ? "Waiting for payment from customer."
                        : "No status updates available."}
                </p>
              )}
            </CardContent>
          </Card>

          {/* User Details */}
          <Card>
            <CardHeader>
              <CardTitle>User Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="font-semibold">Name:</span> {order.user.name}
              </p>
              <p>
                <span className="font-semibold">Email:</span> {order.user.email}
              </p>
              <p>
                <span className="font-semibold">Phone:</span>{" "}
                {order.user.phone || "-"}
              </p>
            </CardContent>
          </Card>

          {/* Order Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="font-semibold">Payment Method:</span>{" "}
                {order.payment_method}
              </p>
              <p>
                <span className="font-semibold">Payment Status:</span>{" "}
                {order.payment_status}
              </p>
              <p>
                <span className="font-semibold">Address:</span>{" "}
                {order.shipping_address}
              </p>
              <p>
                <span className="font-semibold">Date:</span>{" "}
                {new Date(order.created_at).toLocaleString()}
              </p>
              {order.coupon_code && (
                <div className="mt-3 space-y-1 border-t pt-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Coupon Applied:</span>
                    <span className="rounded bg-orange-100 px-2 py-0.5 font-mono text-xs font-bold text-orange-700">
                      {order.coupon_code}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-green-600">
                    <span>Discount</span>
                    <span className="font-semibold">
                      − ৳ {order.discount_amount.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between border-t pt-3 text-base font-bold text-gray-900">
                <span>Total</span>
                <span className="text-primary">
                  ৳ {order.total_amount.toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
