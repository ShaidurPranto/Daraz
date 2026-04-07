"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/lib/authStore";
import { ArrowLeft, Plus, Trash2, Pencil, CalendarPlus, CalendarMinus } from "lucide-react";
import { toast } from "sonner";
import {
  fetchAdminCoupons,
  createCouponByAdmin,
  updateCouponByAdmin,
  adjustCouponDaysByAdmin,
  deleteCouponByAdmin,
  type Coupon,
  type CouponDiscountType,
  type CouponPromotionChannel,
} from "@/lib/api";

const ALL_CHANNELS: CouponPromotionChannel[] = ["TV", "Facebook", "Newspaper", "Other"];

type FormState = {
  code: string;
  discount_type: CouponDiscountType;
  discount_value: string;
  min_order_amount: string;
  max_discount_amount: string;
  start_date: string;
  end_date: string;
  usage_limit: string;
  promotion_channels: CouponPromotionChannel[];
  promotion_notes: string;
};

const emptyForm = (): FormState => ({
  code: "",
  discount_type: "percentage",
  discount_value: "",
  min_order_amount: "0",
  max_discount_amount: "",
  start_date: new Date().toISOString().slice(0, 10),
  end_date: "",
  usage_limit: "",
  promotion_channels: [],
  promotion_notes: "",
});

function toLocalDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-BD", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function isExpired(end_date: string) {
  return new Date(end_date) < new Date();
}

export default function AdminCouponsPage() {
  const router = useRouter();
  const { user, isLoggedIn, hasInitialized, initializeFromStorage } = useAuthStore();

  const [isLoading, setIsLoading] = useState(true);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustDays, setAdjustDays] = useState("");

  useEffect(() => {
    if (!hasInitialized) initializeFromStorage();
  }, []);

  useEffect(() => {
    if (hasInitialized) {
      if (!isLoggedIn || !user?.is_admin) {
        router.push("/admin-login");
      } else {
        setIsLoading(false);
      }
    }
  }, [hasInitialized, isLoggedIn, user?.is_admin, router]);

  useEffect(() => {
    if (!isLoading) {
      fetchAdminCoupons()
        .then(setCoupons)
        .catch(() => toast.error("Failed to load coupons"));
    }
  }, [isLoading]);

  const handleChannelToggle = (channel: CouponPromotionChannel) => {
    setForm((prev) => ({
      ...prev,
      promotion_channels: prev.promotion_channels.includes(channel)
        ? prev.promotion_channels.filter((c) => c !== channel)
        : [...prev.promotion_channels, channel],
    }));
  };

  const openCreate = () => {
    setEditingCoupon(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setForm({
      code: coupon.code,
      discount_type: coupon.discount_type,
      discount_value: String(coupon.discount_value),
      min_order_amount: String(coupon.min_order_amount),
      max_discount_amount: coupon.max_discount_amount ? String(coupon.max_discount_amount) : "",
      start_date: coupon.start_date.slice(0, 10),
      end_date: coupon.end_date.slice(0, 10),
      usage_limit: coupon.usage_limit ? String(coupon.usage_limit) : "",
      promotion_channels: coupon.promotion_channels,
      promotion_notes: coupon.promotion_notes || "",
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.end_date) {
      toast.error("End date is required");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        code: form.code,
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        min_order_amount: Number(form.min_order_amount) || 0,
        max_discount_amount: form.max_discount_amount ? Number(form.max_discount_amount) : null,
        start_date: new Date(form.start_date).toISOString(),
        end_date: new Date(form.end_date + "T23:59:59").toISOString(),
        usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
        promotion_channels: form.promotion_channels,
        promotion_notes: form.promotion_notes || null,
      };

      if (editingCoupon) {
        const updated = await updateCouponByAdmin(editingCoupon.id, payload);
        setCoupons((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        toast.success("Coupon updated");
      } else {
        const created = await createCouponByAdmin(payload);
        setCoupons((prev) => [created, ...prev]);
        toast.success("Coupon created");
      }

      setShowForm(false);
      setEditingCoupon(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save coupon");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (coupon: Coupon) => {
    try {
      const updated = await updateCouponByAdmin(coupon.id, { is_active: !coupon.is_active });
      setCoupons((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      toast.success(`Coupon ${updated.is_active ? "activated" : "deactivated"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update coupon");
    }
  };

  const handleAdjustDays = async (couponId: string) => {
    const days = Number(adjustDays);
    if (!days || isNaN(days)) {
      toast.error("Enter a non-zero number of days");
      return;
    }
    try {
      const updated = await adjustCouponDaysByAdmin(couponId, days);
      setCoupons((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      toast.success(
        `Validity ${days > 0 ? "extended" : "reduced"} by ${Math.abs(days)} day(s)`,
      );
      setAdjustingId(null);
      setAdjustDays("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to adjust days");
    }
  };

  const handleDelete = async (coupon: Coupon) => {
    if (!confirm(`Delete coupon "${coupon.code}"? This cannot be undone.`)) return;
    try {
      await deleteCouponByAdmin(coupon.id);
      setCoupons((prev) => prev.filter((c) => c.id !== coupon.id));
      toast.success(`Coupon "${coupon.code}" deleted`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete coupon");
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-1 h-4 w-4" />
                Dashboard
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Manage Coupons</h1>
          </div>
          <Button onClick={openCreate} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Coupon
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        {/* Create / Edit Form */}
        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle>{editingCoupon ? "Edit Coupon" : "Create New Coupon"}</CardTitle>
              <CardDescription>
                {editingCoupon
                  ? `Editing ${editingCoupon.code}`
                  : "Fill in the details to create a new coupon code"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
                {/* Code */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Coupon Code</label>
                  <Input
                    value={form.code}
                    onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                    placeholder="e.g. SAVE20"
                    required
                  />
                </div>

                {/* Discount Type */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Discount Type</label>
                  <select
                    value={form.discount_type}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        discount_type: e.target.value as CouponDiscountType,
                      }))
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (৳)</option>
                  </select>
                </div>

                {/* Discount Value */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">
                    Discount Value{" "}
                    <span className="text-gray-500">
                      ({form.discount_type === "percentage" ? "%" : "৳"})
                    </span>
                  </label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={form.discount_type === "percentage" ? "100" : undefined}
                    value={form.discount_value}
                    onChange={(e) => setForm((p) => ({ ...p, discount_value: e.target.value }))}
                    placeholder={form.discount_type === "percentage" ? "e.g. 10" : "e.g. 100"}
                    required
                  />
                </div>

                {/* Min Order Amount */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">
                    Min Order Amount (৳)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.min_order_amount}
                    onChange={(e) => setForm((p) => ({ ...p, min_order_amount: e.target.value }))}
                    placeholder="0"
                  />
                </div>

                {/* Max Discount (only for percentage) */}
                {form.discount_type === "percentage" && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">
                      Max Discount Cap (৳) <span className="text-gray-400">Optional</span>
                    </label>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={form.max_discount_amount}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, max_discount_amount: e.target.value }))
                      }
                      placeholder="No cap"
                    />
                  </div>
                )}

                {/* Usage Limit */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">
                    Usage Limit <span className="text-gray-400">Optional (blank = unlimited)</span>
                  </label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={form.usage_limit}
                    onChange={(e) => setForm((p) => ({ ...p, usage_limit: e.target.value }))}
                    placeholder="Unlimited"
                  />
                </div>

                {/* Start Date */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Start Date</label>
                  <Input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
                    required
                  />
                </div>

                {/* End Date */}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">End Date</label>
                  <Input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
                    required
                  />
                </div>

                {/* Promotion Channels */}
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-gray-700">Promotion Channels</label>
                  <div className="flex flex-wrap gap-3">
                    {ALL_CHANNELS.map((channel) => (
                      <label
                        key={channel}
                        className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={form.promotion_channels.includes(channel)}
                          onChange={() => handleChannelToggle(channel)}
                          className="h-4 w-4"
                        />
                        {channel}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Promotion Notes */}
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium text-gray-700">
                    Promotion Notes <span className="text-gray-400">Optional</span>
                  </label>
                  <textarea
                    value={form.promotion_notes}
                    onChange={(e) => setForm((p) => ({ ...p, promotion_notes: e.target.value }))}
                    placeholder="e.g. Eid special — advertised on BTV and Prothom Alo"
                    rows={2}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>

                <div className="flex gap-3 md:col-span-2">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting
                      ? editingCoupon
                        ? "Saving..."
                        : "Creating..."
                      : editingCoupon
                        ? "Save Changes"
                        : "Create Coupon"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowForm(false);
                      setEditingCoupon(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Coupon List */}
        <Card>
          <CardHeader>
            <CardTitle>All Coupons</CardTitle>
            <CardDescription>{coupons.length} coupon(s) total</CardDescription>
          </CardHeader>
          <CardContent>
            {coupons.length === 0 ? (
              <p className="py-8 text-center text-gray-500">
                No coupons yet. Click &quot;New Coupon&quot; to create one.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-3 pr-4 font-medium">Code</th>
                      <th className="pb-3 pr-4 font-medium">Discount</th>
                      <th className="pb-3 pr-4 font-medium">Validity</th>
                      <th className="pb-3 pr-4 font-medium">Usage</th>
                      <th className="pb-3 pr-4 font-medium">Channels</th>
                      <th className="pb-3 pr-4 font-medium">Status</th>
                      <th className="pb-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {coupons.map((coupon) => {
                      const expired = isExpired(coupon.end_date);
                      return (
                        <tr key={coupon.id} className="align-top">
                          {/* Code */}
                          <td className="py-3 pr-4">
                            <span className="rounded bg-gray-100 px-2 py-1 font-mono font-semibold text-gray-800">
                              {coupon.code}
                            </span>
                          </td>

                          {/* Discount */}
                          <td className="py-3 pr-4">
                            <div className="font-semibold text-gray-900">
                              {coupon.discount_type === "percentage"
                                ? `${coupon.discount_value}%`
                                : `৳${coupon.discount_value}`}
                            </div>
                            {coupon.min_order_amount > 0 && (
                              <div className="text-xs text-gray-500">
                                Min order: ৳{coupon.min_order_amount}
                              </div>
                            )}
                            {coupon.max_discount_amount && (
                              <div className="text-xs text-gray-500">
                                Cap: ৳{coupon.max_discount_amount}
                              </div>
                            )}
                          </td>

                          {/* Validity */}
                          <td className="py-3 pr-4">
                            <div>{toLocalDate(coupon.start_date)}</div>
                            <div className="text-gray-500">→ {toLocalDate(coupon.end_date)}</div>
                            {expired && (
                              <span className="mt-1 inline-block rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                                Expired
                              </span>
                            )}

                            {/* Adjust Days */}
                            {adjustingId === coupon.id ? (
                              <div className="mt-2 flex items-center gap-1">
                                <Input
                                  type="number"
                                  value={adjustDays}
                                  onChange={(e) => setAdjustDays(e.target.value)}
                                  placeholder="days (±)"
                                  className="h-7 w-24 text-xs"
                                />
                                <Button
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => handleAdjustDays(coupon.id)}
                                >
                                  Apply
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => {
                                    setAdjustingId(null);
                                    setAdjustDays("");
                                  }}
                                >
                                  ✕
                                </Button>
                              </div>
                            ) : (
                              <div className="mt-1 flex gap-1">
                                <button
                                  title="Add days"
                                  onClick={() => {
                                    setAdjustingId(coupon.id);
                                    setAdjustDays("");
                                  }}
                                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-green-600"
                                >
                                  <CalendarPlus className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  title="Subtract days"
                                  onClick={() => {
                                    setAdjustingId(coupon.id);
                                    setAdjustDays("-");
                                  }}
                                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                                >
                                  <CalendarMinus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </td>

                          {/* Usage */}
                          <td className="py-3 pr-4">
                            <div>
                              {coupon.used_count}
                              {coupon.usage_limit !== null
                                ? ` / ${coupon.usage_limit}`
                                : " / ∞"}
                            </div>
                            {coupon.usage_limit !== null && (
                              <div className="mt-1 h-1.5 w-20 rounded-full bg-gray-200">
                                <div
                                  className="h-1.5 rounded-full bg-primary"
                                  style={{
                                    width: `${Math.min(100, (coupon.used_count / coupon.usage_limit) * 100)}%`,
                                  }}
                                />
                              </div>
                            )}
                          </td>

                          {/* Channels */}
                          <td className="py-3 pr-4">
                            {coupon.promotion_channels.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {coupon.promotion_channels.map((ch) => (
                                  <span
                                    key={ch}
                                    className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700"
                                  >
                                    {ch}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                            {coupon.promotion_notes && (
                              <p className="mt-1 max-w-[160px] truncate text-xs text-gray-400" title={coupon.promotion_notes}>
                                {coupon.promotion_notes}
                              </p>
                            )}
                          </td>

                          {/* Status */}
                          <td className="py-3 pr-4">
                            <button
                              onClick={() => handleToggleActive(coupon)}
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                                coupon.is_active
                                  ? "bg-green-100 text-green-800 hover:bg-green-200"
                                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                              }`}
                            >
                              {coupon.is_active ? "Active" : "Inactive"}
                            </button>
                          </td>

                          {/* Actions */}
                          <td className="py-3">
                            <div className="flex gap-1">
                              <button
                                onClick={() => openEdit(coupon)}
                                title="Edit coupon"
                                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(coupon)}
                                title="Delete coupon"
                                className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
