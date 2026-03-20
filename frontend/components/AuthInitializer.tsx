"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/lib/authStore";

export default function AuthInitializer() {
    const initializeFromStorage = useAuthStore((state) => state.initializeFromStorage);

    useEffect(() => {
        initializeFromStorage();
    }, [initializeFromStorage]);

    return null;
}
