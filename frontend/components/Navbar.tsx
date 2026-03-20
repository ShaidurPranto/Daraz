"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, ShoppingCart, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/lib/authStore";

export default function Navbar() {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState("");
    const isLoggedIn = useAuthStore((state) => state.isLoggedIn);
    const hasInitialized = useAuthStore((state) => state.hasInitialized);
    const cartItemsCount = 0;

    useEffect(() => {
        if (!hasInitialized) {
            useAuthStore.getState().initializeFromStorage();
        }
    }, [hasInitialized]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            router.push(`/search?search=${encodeURIComponent(searchQuery.trim())}`);
        }
    };

    return (
        <nav className="sticky top-0 z-50 w-full border-b bg-white shadow-sm">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-primary tracking-tight">Daraz</span>
                </Link>

                {/* Search Bar */}
                <form onSubmit={handleSearch} className="flex-1 max-w-2xl flex items-center">
                    <div className="relative w-full flex">
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

                {/* User Controls */}
                <div className="flex items-center gap-4">
                    {isLoggedIn ? (
                        <>
                            {/* Cart */}
                            <Link href="/cart">
                                <Button variant="ghost" size="icon" className="relative">
                                    <ShoppingCart className="h-5 w-5" />
                                    {cartItemsCount > 0 && (
                                        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                                            {cartItemsCount}
                                        </span>
                                    )}
                                </Button>
                            </Link>
                            {/* Profile */}
                            <Link href="/profile/orders">
                                <Button variant="ghost" size="icon">
                                    <UserIcon className="h-5 w-5" />
                                </Button>
                            </Link>
                        </>
                    ) : (
                        <div className="flex gap-2">
                            <Link href="/login">
                                <Button variant="ghost" className="font-semibold text-gray-600">Login</Button>
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
