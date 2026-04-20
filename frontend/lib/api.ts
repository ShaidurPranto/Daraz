// Server-side (SSR): call backend directly — no Nginx, so NO /api prefix
// Client-side (browser): use /api so Nginx can strip it before forwarding to backend
const BASE_URL =
  typeof window === "undefined"
    ? process.env.NEXT_INTERNAL_SERVER_URL || "http://backend:4000"
    : "/api";

// ---------------------------------------------------------------------------
// IP forwarding helpers — ensures audit logs capture the real client IP
// even when the request is made from the SSR server (Docker bridge network).
//
// Flow:  Browser → Nginx (sets X-Forwarded-For / X-Real-IP) → Next.js SSR
//        → getForwardedIpHeaders() reads those headers from the incoming
//        request via next/headers → apiFetch() forwards them to the backend.
// ---------------------------------------------------------------------------

/**
 * On the server side, reads the real client IP from the incoming request
 * headers (set by Nginx) and returns them for forwarding to the backend.
 * On the client side (browser), returns nothing — the browser talks to
 * Nginx which sets X-Forwarded-For directly on the backend request.
 */
async function getForwardedIpHeaders(): Promise<Record<string, string>> {
  if (typeof window !== "undefined") return {};

  try {
    // eval('require') hides this from webpack/turbopack static analysis,
    // preventing it from being bundled into client-side code where
    // next/headers would fail. At runtime on the server, Node.js
    // resolves the module normally.
    // eslint-disable-next-line no-eval
    const { headers } = eval('require')('next/headers');
    const reqHeaders = await headers();

    // Nginx sets these on the request to the frontend container
    const forwardedFor = reqHeaders.get("x-forwarded-for") || "";
    const realIp = reqHeaders.get("x-real-ip") || "";
    const clientIp = forwardedFor.split(",")[0]?.trim() || realIp;

    if (!clientIp) return {};

    return {
      "x-forwarded-for": clientIp,
      "x-real-ip": clientIp,
    };
  } catch {
    // headers() throws during ISR revalidation (no request context).
    // Silently fall back — the backend will just see the Docker bridge IP.
    return {};
  }
}

/** Extended RequestInit that accepts Next.js-specific `next` options. */
type ApiFetchInit = RequestInit & {
  next?: { revalidate?: number | false; tags?: string[] };
};

/**
 * Drop-in replacement for `fetch()` that automatically attaches the real
 * client IP headers when running on the server.
 */
async function apiFetch(url: string, init: ApiFetchInit = {}): Promise<Response> {
  const ipHeaders = await getForwardedIpHeaders();

  const mergedHeaders: Record<string, string> = {
    ...ipHeaders,
    ...(init.headers
      ? Object.fromEntries(new Headers(init.headers as HeadersInit).entries())
      : {}),
  };

  return fetch(url, { ...init, headers: mergedHeaders });
}


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

  const res = await apiFetch(url, fetchOptions);

  if (!res.ok) {
    throw new Error("Failed to fetch products");
  }

  return res.json();
}

export async function fetchTrendingProducts() {
  const url = `${BASE_URL}/products/trending`;

  const res = await apiFetch(url, {
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
  discount_amount: number;
  coupon_code: string | null;
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

  const res = await apiFetch(url, {
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

  const res = await apiFetch(url, {
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

  const res = await apiFetch(url, {
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

  const res = await apiFetch(url, {
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

  const res = await apiFetch(url, {
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

  const res = await apiFetch(url, {
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
  const res = await apiFetch(url, {
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
  const res = await apiFetch(url, {
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
  const res = await apiFetch(url, {
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
  const res = await apiFetch(url, {
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
  const res = await apiFetch(url, {
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
  await apiFetch(url, {
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

  const res = await apiFetch(url, {
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

  const res = await apiFetch(url, {
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

  const res = await apiFetch(url, {
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

  const res = await apiFetch(url, {
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
  couponCode?: string | null,
) {
  const url = `${BASE_URL}/orders/checkout`;
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  if (!token) {
    throw new Error("Unauthorized - Please login");
  }

  const body: Record<string, string> = {
    payment_method: paymentMethod,
    shipping_address: shippingAddress,
  };
  if (couponCode?.trim()) body.coupon_code = couponCode.trim();

  const res = await apiFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
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
      discount_amount: number;
      coupon_code: string | null;
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

  const res = await apiFetch(url, {
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

  const res = await apiFetch(url, {
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

  const res = await apiFetch(url, {
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

  const res = await apiFetch(url, {
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

  const res = await apiFetch(url, {
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

  const res = await apiFetch(url, {
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
  const res = await apiFetch(url, {
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
  const res = await apiFetch(url, {
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
  const res = await apiFetch(url, {
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
  const res = await apiFetch(url, {
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
  const res = await apiFetch(url, {
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
  const res = await apiFetch(url, {
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
  const res = await apiFetch(url, {
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
  const res = await apiFetch(url, {
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

// ============ SUPPORT API ============

export type TicketStatus = "open" | "in_progress" | "closed";

export interface SupportTicket {
  id: string;
  user_id: string;
  subject: string;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  message_count?: number;
  last_message_at?: string | null;
}

export interface AdminSupportTicket extends SupportTicket {
  user_name: string;
  user_email: string;
}

export interface SupportMessage {
  id: number;
  ticket_id: string;
  sender_id: string;
  sender_name: string;
  is_admin: boolean;
  message: string | null;
  image_url: string | null;
  created_at: string;
}

export interface SupportTicketDetail {
  ticket: SupportTicket;
  messages: SupportMessage[];
}

export interface AdminSupportTicketDetail {
  ticket: AdminSupportTicket & { user_phone?: string | null };
  messages: SupportMessage[];
}

function userToken() {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (!token) throw new Error("Unauthorized - Please login");
  return token;
}

// User: create ticket
export async function createSupportTicket(
  subject: string,
  message: string,
  image_url?: string | null,
): Promise<SupportTicket> {
  const res = await fetch(`${BASE_URL}/support`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${userToken()}` },
    body: JSON.stringify({ subject, message, image_url: image_url || null }),
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Failed to create ticket");
  }
  return (await res.json()).data as SupportTicket;
}

// User: list own tickets
export async function fetchUserSupportTickets(): Promise<SupportTicket[]> {
  const res = await fetch(`${BASE_URL}/support`, {
    headers: { Authorization: `Bearer ${userToken()}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch tickets");
  return (await res.json()).data as SupportTicket[];
}

// User: get ticket detail
export async function fetchUserTicketById(ticketId: string): Promise<SupportTicketDetail> {
  const res = await fetch(`${BASE_URL}/support/${ticketId}`, {
    headers: { Authorization: `Bearer ${userToken()}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch ticket");
  return (await res.json()).data as SupportTicketDetail;
}

// User: send message
export async function sendUserSupportMessage(
  ticketId: string,
  message?: string | null,
  image_url?: string | null,
): Promise<SupportMessage> {
  const res = await fetch(`${BASE_URL}/support/${ticketId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${userToken()}` },
    body: JSON.stringify({ message: message || null, image_url: image_url || null }),
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Failed to send message");
  }
  return (await res.json()).data as SupportMessage;
}

// Admin: list all tickets
export async function adminFetchSupportTickets(status?: TicketStatus): Promise<AdminSupportTicket[]> {
  const params = status ? `?status=${status}` : "";
  const res = await fetch(`${BASE_URL}/support/admin/all${params}`, {
    headers: { Authorization: `Bearer ${adminToken()}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch tickets");
  return (await res.json()).data as AdminSupportTicket[];
}

// Admin: get ticket detail
export async function adminFetchTicketById(ticketId: string): Promise<AdminSupportTicketDetail> {
  const res = await fetch(`${BASE_URL}/support/admin/${ticketId}`, {
    headers: { Authorization: `Bearer ${adminToken()}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch ticket");
  return (await res.json()).data as AdminSupportTicketDetail;
}

// Admin: reply
export async function adminReplySupportTicket(
  ticketId: string,
  message?: string | null,
  image_url?: string | null,
): Promise<SupportMessage> {
  const res = await fetch(`${BASE_URL}/support/admin/${ticketId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken()}` },
    body: JSON.stringify({ message: message || null, image_url: image_url || null }),
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Failed to send reply");
  }
  return (await res.json()).data as SupportMessage;
}

// Admin: update status
export async function adminUpdateTicketStatus(
  ticketId: string,
  status: TicketStatus,
): Promise<SupportTicket> {
  const res = await fetch(`${BASE_URL}/support/admin/${ticketId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken()}` },
    body: JSON.stringify({ status }),
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || "Failed to update status");
  }
  return (await res.json()).data as SupportTicket;
}
