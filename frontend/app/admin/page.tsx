"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/lib/authStore";
import { LogOut, BarChart3, Users, ShoppingCart, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  createProduct,
  fetchAdminDashboardStats,
  fetchCategories,
  logoutCurrentUser,
  type AdminDashboardStats,
  type Category,
} from "@/lib/api";

type ProductFormState = {
  name: string;
  image_url: string;
  brand: string;
  description: string;
  price: string;
  discount_price: string;
  stock: string;
  category_id: string;
  flash_sale: boolean;
};

const initialFormState: ProductFormState = {
  name: "",
  image_url: "",
  brand: "",
  description: "",
  price: "",
  discount_price: "",
  stock: "0",
  category_id: "",
  flash_sale: false,
};

const initialDashboardStats: AdminDashboardStats = {
  total_users: 0,
  total_orders: 0,
  total_products: 0,
  total_revenue: 0,
};

export default function AdminDashboard() {
  const router = useRouter();
  const { user, isLoggedIn, clearAuth, hasInitialized, initializeFromStorage } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [formData, setFormData] = useState<ProductFormState>(initialFormState);
  const [stats, setStats] = useState<AdminDashboardStats>(initialDashboardStats);

  // Initialize from storage on mount only
  useEffect(() => {
    if (!hasInitialized) {
      initializeFromStorage();
    }
  }, []); // Empty dependency array - only run on mount

  // Check auth status and protect page
  useEffect(() => {
    if (hasInitialized) {
      console.log("=== Admin Page Auth Check ===");
      console.log("isLoggedIn:", isLoggedIn);
      console.log("user:", user);
      console.log("user?.is_admin:", user?.is_admin);
      
      if (!isLoggedIn || !user?.is_admin) {
        console.log("Access denied - redirecting to admin-login");
        router.push("/admin-login");
      } else {
        console.log("Access granted - loading dashboard");
        setIsLoading(false);
      }
    }
  }, [hasInitialized, isLoggedIn, user?.is_admin, router]);

  const handleLogout = async () => {
    await logoutCurrentUser();
    clearAuth();
    toast.success("Logged out successfully");
    router.push("/");
  };

  useEffect(() => {
    if (!isLoading) {
      Promise.all([fetchCategories(), fetchAdminDashboardStats()])
        .then(([items, dashboardStats]) => {
          setCategories(items);
          setStats(dashboardStats);
        })
        .catch(() => {
          toast.error("Failed to load admin dashboard data");
        });
    }
  }, [isLoading]);

  const handleFormChange =
    (field: keyof ProductFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value =
        field === "flash_sale" && e.target instanceof HTMLInputElement
          ? e.target.checked
          : e.target.value;

      setFormData((prev) => ({
        ...prev,
        [field]: value,
      }));
    };

  const handleCreateProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formData.category_id) {
      toast.error("Please select a category");
      return;
    }

    setIsSubmitting(true);
    try {
      await createProduct({
        name: formData.name.trim(),
        image_url: formData.image_url.trim(),
        brand: formData.brand.trim() || null,
        description: formData.description.trim() || null,
        price: Number(formData.price),
        discount_price: formData.discount_price ? Number(formData.discount_price) : null,
        stock: Number(formData.stock),
        flash_sale: formData.flash_sale,
        category_id: Number(formData.category_id),
      });

      window.dispatchEvent(new Event("adminProductsUpdated"));

      toast.success("Product created successfully");
      setFormData(initialFormState);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create product");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-gray-600">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="mt-1 text-gray-600">Welcome back, {user?.name}!</p>
          </div>
          <Button
            onClick={handleLogout}
            variant="outline"
            className="flex items-center gap-2"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats Grid */}
        <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Total Users */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_users.toLocaleString()}</div>
            </CardContent>
          </Card>

          {/* Total Orders */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_orders.toLocaleString()}</div>
              <p className="text-xs text-gray-600">All orders placed</p>
            </CardContent>
          </Card>

          {/* Revenue */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">৳ {stats.total_revenue.toLocaleString()}</div>
            </CardContent>
          </Card>

          {/* Products */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Products</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_products.toLocaleString()}</div>
              <p className="text-xs text-gray-600">Current product catalog size</p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity Section */}
        <div className="mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Manage your store</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Link href="/admin/products">
                <Button variant="outline" className="w-full">
                  Manage Products
                </Button>
              </Link>
              <Link href="/admin/orders">
                <Button variant="outline" className="w-full">
                  View Orders
                </Button>
              </Link>
              <Link href="/admin/users">
                <Button variant="outline" className="w-full">
                  View Users
                </Button>
              </Link>
              <Link href="/admin/analytics">
                <Button variant="outline" className="w-full">
                  Sales Analytics
                </Button>
              </Link>
              <Link href="/admin/coupons">
                <Button variant="outline" className="w-full">
                  Manage Coupons
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        <div className="mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Add New Product</CardTitle>
              <CardDescription>Create and publish a product for users</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateProduct} className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-gray-700" htmlFor="product-name">
                    Product Name
                  </label>
                  <Input
                    id="product-name"
                    value={formData.name}
                    onChange={handleFormChange("name")}
                    placeholder="Product name"
                    required
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-gray-700" htmlFor="product-image-url">
                    Image URL
                  </label>
                  <Input
                    id="product-image-url"
                    type="url"
                    value={formData.image_url}
                    onChange={handleFormChange("image_url")}
                    placeholder="https://example.com/image.jpg"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700" htmlFor="product-brand">
                    Brand
                  </label>
                  <Input
                    id="product-brand"
                    value={formData.brand}
                    onChange={handleFormChange("brand")}
                    placeholder="Brand name"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700" htmlFor="product-category">
                    Category
                  </label>
                  <Combobox
                    items={categories}
                    value={categories.find((c) => String(c.id) === formData.category_id) || null}
                    onValueChange={(val) => {
                      const cat = val as Category | null;
                      setFormData((prev) => ({
                        ...prev,
                        category_id: cat ? String(cat.id) : "",
                      }));
                    }}
                  >
                    <ComboboxInput
                      id="product-category"
                      className="w-full"
                      placeholder="Select a category"
                    />
                    <ComboboxContent>
                      <ComboboxEmpty>No categories found.</ComboboxEmpty>
                      <ComboboxList>
                        {(category: Category) => (
                          <ComboboxItem key={category.id} value={category}>
                            {category.name}
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-gray-700" htmlFor="product-description">
                    Description
                  </label>
                  <textarea
                    id="product-description"
                    value={formData.description}
                    onChange={handleFormChange("description")}
                    placeholder="Write a short product description"
                    rows={4}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700" htmlFor="product-price">
                    Price
                  </label>
                  <Input
                    id="product-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.price}
                    onChange={handleFormChange("price")}
                    placeholder="0.00"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700" htmlFor="product-discount-price">
                    Discount Price (Optional)
                  </label>
                  <Input
                    id="product-discount-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.discount_price}
                    onChange={handleFormChange("discount_price")}
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700" htmlFor="product-stock">
                    Stock
                  </label>
                  <Input
                    id="product-stock"
                    type="number"
                    min="0"
                    step="1"
                    value={formData.stock}
                    onChange={handleFormChange("stock")}
                    required
                  />
                </div>

                <div className="flex items-center gap-2 pt-7">
                  <input
                    id="product-flash-sale"
                    type="checkbox"
                    checked={formData.flash_sale}
                    onChange={handleFormChange("flash_sale")}
                    className="h-4 w-4"
                  />
                  <label className="text-sm font-medium text-gray-700" htmlFor="product-flash-sale">
                    Enable flash sale
                  </label>
                </div>

                <div className="md:col-span-2">
                  <Button type="submit" disabled={isSubmitting} className="w-full md:w-auto">
                    {isSubmitting ? "Adding Product..." : "Add Product"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Admin Info */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Admin Account Info</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-gray-600">Name:</span>
                  <span className="font-semibold">{user?.name}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-gray-600">Email:</span>
                  <span className="font-semibold">{user?.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">
                    Active Admin
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
