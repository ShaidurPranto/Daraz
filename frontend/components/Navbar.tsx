"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Search, ShoppingCart, User as UserIcon, LayoutDashboard, HeadphonesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/lib/authStore";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoggedIn, hasInitialized, initializeFromStorage } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [mounted, setMounted] = useState(false);

  // Initialize auth on mount
  useEffect(() => {
    if (!hasInitialized) {
      initializeFromStorage();
    }
  }, [hasInitialized, initializeFromStorage]);

  // Mark as mounted for hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-white shadow-sm">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* Admin Dashboard Button - Top Left for admins */}
        <div className="flex items-center gap-2">
          {user?.is_admin && (
            <Link href="/admin">
              <Button variant="default" size="icon" className="bg-orange-600 hover:bg-orange-700" title="Go to Admin Dashboard">
                <LayoutDashboard className="h-5 w-5" />
              </Button>
            </Link>
          )}
          
          {/* Logo - Hidden for admins, show for regular users */}
          {!user?.is_admin && (
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/daraz-logo.png"
                alt="Daraz"
                width={180}
                height={60}
                className="h-10 w-auto"
                priority
              />
            </Link>
          )}
        </div>

        {/* Search Bar - Centered */}
        {pathname !== "/search" && (
          <form
            onSubmit={handleSearch}
            className="flex-1 flex justify-center"
          >
            <div className="relative w-full max-w-2xl flex">
              <Input
                type="text"
                placeholder="Search in Daraz..."
                className="w-full rounded-r-none border-r-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Button
                type="submit"
                variant="default"
                className="rounded-l-none bg-primary hover:bg-primary/90 text-white px-6"
              >
                <Search className="h-5 w-5" />
              </Button>
            </div>
          </form>
        )}

        {/* User Controls - Right Side */}
        <div className="flex items-center gap-4">
          {!mounted ? (
            // Show nothing while mounting to prevent hydration flicker
            <div className="w-32 h-10" />
          ) : isLoggedIn ? (
            <>
              {/* Cart - Only for regular users */}
              {!user?.is_admin && (
                <Link href="/cart">
                  <Button variant="ghost" size="icon" className="relative">
                    <ShoppingCart className="h-5 w-5" />
                  </Button>
                </Link>
              )}
              {/* Support - Only for regular users */}
              {!user?.is_admin && (
                <Link href="/support">
                  <Button variant="ghost" size="icon" title="Support">
                    <HeadphonesIcon className="h-5 w-5" />
                  </Button>
                </Link>
              )}
              {/* Profile - Only for regular users */}
              {!user?.is_admin && (
                <Link href="/profile/orders">
                  <Button variant="ghost" size="icon">
                    <UserIcon className="h-5 w-5" />
                  </Button>
                </Link>
              )}
            </>
          ) : (
            <div className="flex gap-2">
              <Link href="/login">
                <Button variant="ghost" className="font-semibold text-gray-600">
                  Login
                </Button>
              </Link>
              <Link href="/register">
                <Button className="font-semibold">Sign Up</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
