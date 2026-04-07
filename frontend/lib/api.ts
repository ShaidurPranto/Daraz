// Server-side (SSR): call backend directly — no Nginx, so NO /api prefix
// Client-side (browser): use /api so Nginx can strip it before forwarding to backend
const BASE_URL =
  typeof window === "undefined"
    ? process.env.NEXT_INTERNAL_SERVER_URL || "http://backend:4000"
    : "/api";

export async function fetchProducts(
  params: Record<string, string | null> = {},
) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.append(key, value);
  });

  const url = `${BASE_URL}/products?${query.toString()}`;

  const fetchOptions =
    typeof window === "undefined"
      ? { next: { revalidate: 1 as const } }
      : { cache: "no-store" as const };

  const res = await fetch(url, fetchOptions);

  if (!res.ok) {
    throw new Error("Failed to fetch products");
  }

  return res.json();
}

export async function fetchTrendingProducts() {
  const url = `${BASE_URL}/products/trending`;

  const res = await fetch(url, {
    next: { revalidate: 1 },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch trending products");
  }

  return res.json();
}

export interface Category {
  id: number;
  name: string;
}

export interface CreateProductPayload {
  name: string;
  image_url: string;
  brand?: string | null;
  description?: string | null;
  price: number;
  discount_price?: number | null;
  stock: number;
  flash_sale?: boolean;
  category_id: number;
}

export interface AdminOrderSummary {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  order_status: string;
  shipping_address: string;
  created_at: string;
  total_items: number;
}

export interface AdminOrderDetails {
  id: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
  };
  total_amount: number;
  payment_method: string;
  payment_status: string;
  order_status: string;
  shipping_address: string;
  created_at: string;
  order_items: Array<{
    id: number;
    product_id: string;
    product_name: string;
    brand?: string | null;
    image_url?: string | null;
    quantity: number;
    price: number;
    rating?: number | null;
    review?: string | null;
    review_date?: string | null;
  }>;
}

export interface AdminUserInfo {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  is_admin?: boolean;
  created_at: string;
  total_orders: number;
  total_spent: number;
  last_order_at?: string | null;
  last_cart_at?: string | null;
  last_seen_at?: string | null;
  last_activity_at: string;
  status: string;
}

export interface AdminUserDetails {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  created_at: string;
  last_seen_at?: string | null;
  status: string;
  total_orders: number;
  total_spent: number;
  last_order_at?: string | null;
  last_cart_at?: string | null;
  recent_orders: Array<{
    id: string;
    total_amount: number;
    payment_status: string;
    order_status: string;
    created_at: string;
    total_items: number;
  }>;
}

export interface AdminDashboardStats {
  total_users: number;
  total_orders: number;
  total_products: number;
  total_revenue: number;
}

export interface AdminAnalyticsDailyPoint {
  date: string;
  order_count: number;
  gross_revenue: number;
  commission_revenue: number;
}

export interface AdminAnalyticsTopProduct {
  id: string;
  name: string;
  brand?: string | null;
  units_sold: number;
  gross_sales: number;
  commission_revenue: number;
}

export interface AdminSalesAnalytics {
  range: {
    start_date: string;
    end_date: string;
  };
  summary: {
    total_orders: number;
    gross_revenue: number;
    commission_revenue: number;
  };
  daily: AdminAnalyticsDailyPoint[];
  top_products: AdminAnalyticsTopProduct[];
}

export async function fetchCategories(): Promise<Category[]> {
  const url = `${BASE_URL}/products/categories`;

  const res = await fetch(url, {
    next: { revalidate: 1 }, // Cache categories for 1 hour
  });

  if (!res.ok) {
    // fallback to static categories if endpoint fails
    return [
      { id: 1, name: "Electronics" },
      { id: 2, name: "Clothing" },
      { id: 3, name: "Home & Kitchen" },
      { id: 4, name: "Books" },
      { id: 5, name: "Beauty" },
      { id: 6, name: "Sports" },
    ];
  }

  const json = await res.json();
  return json.data as Category[];
}

export async function fetchProduct(id: string) {
  const url = `${BASE_URL}/products/${id}`;

  const res = await fetch(url, {
    next: { revalidate: 1 },
  });

  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error("Failed to fetch product");
  }

  const json = await res.json();
  return json.data;
}

export async function createProduct(payload: CreateProductPayload) {
  const url = `${BASE_URL}/products`;
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  if (!token) {
    throw new Error("Unauthorized - Please login as admin");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to create product");
  }

  return res.json();
}

export async function updateProductByAdmin(
  productId: string,
  payload: CreateProductPayload,
) {
  const url = `${BASE_URL}/products/${productId}`;
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  if (!token) {
    throw new Error("Unauthorized - Please login as admin");
  }

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to update product");
  }

  return res.json();
}

export async function deleteProductByAdmin(productId: string) {
  const url = `${BASE_URL}/products/${productId}`;
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  if (!token) {
    throw new Error("Unauthorized - Please login as admin");
  }

  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to delete product");
  }

  return res.json();
}

export async function fetchAdminCompletedOrders(nameFilter?: string) {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  if (!token) {
    throw new Error("Unauthorized - Please login as admin");
  }

  const params = new URLSearchParams();
  if (nameFilter?.trim()) {
    params.set("name", nameFilter.trim());
  }

  const url = `${BASE_URL}/admin/orders${params.toString() ? `?${params.toString()}` : ""}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to fetch admin orders");
  }

  const json = await res.json();
  return json.data as AdminOrderSummary[];
}

export async function fetchAdminOrderById(orderId: string) {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  if (!token) {
    throw new Error("Unauthorized - Please login as admin");
  }

  const url = `${BASE_URL}/admin/orders/${orderId}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to fetch order details");
  }

  const json = await res.json();
  return json.data as AdminOrderDetails;
}

export async function fetchAdminUsers() {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  if (!token) {
    throw new Error("Unauthorized - Please login as admin");
  }

  const url = `${BASE_URL}/admin/users`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to fetch users");
  }

  const json = await res.json();
  return json.data as AdminUserInfo[];
}

export async function fetchAdminDashboardStats() {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  if (!token) {
    throw new Error("Unauthorized - Please login as admin");
  }

  const url = `${BASE_URL}/admin/stats`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to fetch dashboard stats");
  }

  const json = await res.json();
  return json.data as AdminDashboardStats;
}

export async function fetchAdminSalesAnalytics(startDate: string, endDate: string) {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  if (!token) {
    throw new Error("Unauthorized - Please login as admin");
  }

  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
  });

  const url = `${BASE_URL}/admin/analytics?${params.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to fetch sales analytics");
  }

  const json = await res.json();
  return json.data as AdminSalesAnalytics;
}

export async function fetchAdminUserById(userId: string) {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  if (!token) {
    throw new Error("Unauthorized - Please login as admin");
  }

  const url = `${BASE_URL}/admin/users/${userId}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to fetch user details");
  }

  const json = await res.json();
  return json.data as AdminUserDetails;
}

export async function logoutCurrentUser() {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  if (!token) {
    return;
  }

  const url = `${BASE_URL}/auth/logout`;
  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
}

// ============ CART API FUNCTIONS ============

export async function fetchCart() {
  const url = `${BASE_URL}/cart`;
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Unauthorized - Please login");
    }
    throw new Error("Failed to fetch cart");
  }

  return res.json();
}

export async function updateCartItem(cartItemId: number, quantity: number) {
  const url = `${BASE_URL}/cart/${cartItemId}`;
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  if (!token) {
    throw new Error("Unauthorized - Please login");
  }

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ quantity }),
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Unauthorized - Please login");
    }
    throw new Error("Failed to update cart item");
  }

  return res.json();
}

export async function removeCartItem(cartItemId: number) {
  const url = `${BASE_URL}/cart/${cartItemId}`;
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  if (!token) {
    throw new Error("Unauthorized - Please login");
  }

  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Unauthorized - Please login");
    }
    throw new Error("Failed to remove cart item");
  }

  return res.json();
}

export async function addToCart(productId: string, quantity: number) {
  const url = `${BASE_URL}/cart`;
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  console.log("[addToCart] Token:", token ? "Found" : "Not found");
  console.log("[addToCart] URL:", url);

  if (!token) {
    throw new Error("Unauthorized - Please login");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ productId, quantity }),
    cache: "no-store",
  });

  console.log("[addToCart] Response status:", res.status);

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Unauthorized - Please login");
    }
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to add item to cart");
  }

  return res.json();
}

// ============ ORDER API FUNCTIONS ============

export async function placeOrder(
  paymentMethod: string,
  shippingAddress: string,
) {
  const url = `${BASE_URL}/orders/checkout`;
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  if (!token) {
    throw new Error("Unauthorized - Please login");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      payment_method: paymentMethod,
      shipping_address: shippingAddress,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Unauthorized - Please login");
    }
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to place order");
  }

  const json = await res.json();
  return json as {
    status: string;
    message: string;
    data: {
      orderId: string;
      total_amount: number;
      redirect: boolean;
      checkout_url?: string;
    };
  };
}

export async function fetchOrders() {
  const url = `${BASE_URL}/orders`;
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Unauthorized - Please login");
    }
    throw new Error("Failed to fetch orders");
  }

  return res.json();
}

export async function fetchOrderById(orderId: string | number) {
  const url = `${BASE_URL}/orders/${orderId}`;
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Unauthorized - Please login");
    }
    if (res.status === 404) {
      throw new Error("Order not found");
    }
    throw new Error("Failed to fetch order");
  }

  return res.json();
}

// ============ REVIEW API FUNCTIONS ============

export async function fetchProductReviews(productId: string) {
  const url = `${BASE_URL}/reviews/product/${productId}`;

  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Failed to fetch reviews");
  }

  return res.json();
}

export async function submitReview(
  productId: string,
  rating: number,
  review: string,
) {
  const url = `${BASE_URL}/reviews`;
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  if (!token) {
    throw new Error("Unauthorized - Please login");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      productId,
      rating,
      review: review || null,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Unauthorized - Please login");
    }
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to submit review");
  }

  return res.json();
}

export async function fetchProductReliabilityScore(productId: string) {
  const url = `${BASE_URL}/ai/reliability/${productId}`;

  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Failed to fetch reliability score");
  }

  return res.json();
}

// ============ ADMIN ORDER STATUS API ============

export async function fetchAdminOrders(nameFilter?: string) {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  if (!token) {
    throw new Error("Unauthorized - Please login as admin");
  }

  const params = new URLSearchParams();
  if (nameFilter?.trim()) {
    params.set("name", nameFilter.trim());
  }

  const url = `${BASE_URL}/admin/orders${params.toString() ? `?${params.toString()}` : ""}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to fetch admin orders");
  }

  const json = await res.json();
  return json.data as AdminOrderSummary[];
}

export async function updateAdminOrderStatus(
  orderId: string,
  orderStatus: string,
) {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  if (!token) {
    throw new Error("Unauthorized - Please login as admin");
  }

  const url = `${BASE_URL}/admin/orders/${orderId}/status`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ order_status: orderStatus }),
    cache: "no-store",
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to update order status");
  }

  return res.json();
}

// ============ COUPON API ============

export type CouponDiscountType = "percentage" | "fixed";
export type CouponPromotionChannel = "TV" | "Facebook" | "Newspaper" | "Other";

export interface Coupon {
  id: string;
  code: string;
  discount_type: CouponDiscountType;
  discount_value: number;
  min_order_amount: number;
  max_discount_amount: number | null;
  start_date: string;
  end_date: string;
  usage_limit: number | null;
  used_count: number;
  is_active: boolean;
  promotion_channels: CouponPromotionChannel[];
  promotion_notes: string | null;
  created_at: string;
}

export interface CreateCouponPayload {
  code: string;
  discount_type: CouponDiscountType;
  discount_value: number;
  min_order_amount?: number;
  max_discount_amount?: number | null;
  start_date: string;
  end_date: string;
  usage_limit?: number | null;
  promotion_channels?: CouponPromotionChannel[];
  promotion_notes?: string | null;
}

export interface CouponValidationResult {
  coupon_id: string;
  code: string;
  discount_type: CouponDiscountType;
  discount_value: number;
  discount_amount: number;
  final_amount: number;
}

function adminToken() {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (!token) throw new Error("Unauthorized - Please login as admin");
  return token;
}

export async function fetchAdminCoupons(): Promise<Coupon[]> {
  const url = `${BASE_URL}/coupons`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${adminToken()}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Failed to fetch coupons");
  }
  const json = await res.json();
  return json.data as Coupon[];
}

export async function createCouponByAdmin(payload: CreateCouponPayload): Promise<Coupon> {
  const url = `${BASE_URL}/coupons`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken()}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Failed to create coupon");
  }
  const json = await res.json();
  return json.data as Coupon;
}

export async function updateCouponByAdmin(
  couponId: string,
  payload: Partial<CreateCouponPayload> & { is_active?: boolean },
): Promise<Coupon> {
  const url = `${BASE_URL}/coupons/${couponId}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken()}`,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Failed to update coupon");
  }
  const json = await res.json();
  return json.data as Coupon;
}

export async function adjustCouponDaysByAdmin(couponId: string, days: number): Promise<Coupon> {
  const url = `${BASE_URL}/coupons/${couponId}/days`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken()}`,
    },
    body: JSON.stringify({ days }),
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Failed to adjust coupon days");
  }
  const json = await res.json();
  return json.data as Coupon;
}

export async function deleteCouponByAdmin(couponId: string): Promise<void> {
  const url = `${BASE_URL}/coupons/${couponId}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminToken()}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Failed to delete coupon");
  }
}

export async function validateCouponCode(
  code: string,
  order_amount: number,
): Promise<CouponValidationResult> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const url = `${BASE_URL}/coupons/validate`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ code, order_amount }),
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Invalid coupon");
  }
  const json = await res.json();
  return json.data as CouponValidationResult;
}

// ============ AUDIT LOGS API ============

export interface AuditLog {
  id: number;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  method: string;
  path: string;
  frontend_url: string | null;
  ip: string | null;
  user_agent: string | null;
  status_code: number | null;
  req_body: Record<string, unknown> | null;
  res_body: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogMeta {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export async function fetchAuditLogs(params: {
  user_id?: string;
  user_email?: string;
  method?: string;
  path?: string;
  status_code?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: AuditLog[]; meta: AuditLogMeta }> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  if (!token) {
    throw new Error("Unauthorized - Please login as admin");
  }

  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      query.set(k, String(v));
    }
  });

  const url = `${BASE_URL}/admin/audit-logs?${query.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error((errorData as { message?: string }).message || "Failed to fetch audit logs");
  }

  const json = await res.json();
  return { data: json.data as AuditLog[], meta: json.meta as AuditLogMeta };
}
