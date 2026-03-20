import { create } from "zustand";

type AuthUser = {
    id?: number | string;
    name?: string;
    email?: string;
    phone?: string;
};

type AuthState = {
    isLoggedIn: boolean;
    token: string | null;
    user: AuthUser | null;
    setAuth: (token: string, user: AuthUser) => void;
    clearAuth: () => void;
    initializeFromStorage: () => void;
};

const getStoredToken = () => {
    if (typeof window === "undefined") {
        return null;
    }
    return localStorage.getItem("token");
};

const getStoredUser = (): AuthUser | null => {
    if (typeof window === "undefined") {
        return null;
    }
    const storedUser = localStorage.getItem("user");
    if (!storedUser) {
        return null;
    }
    try {
        return JSON.parse(storedUser) as AuthUser;
    } catch (error) {
        console.error("Failed to parse stored user", error);
        return null;
    }
};

export const useAuthStore = create<AuthState>((set) => ({
    isLoggedIn: false,
    token: null,
    user: null,
    setAuth: (token, user) => {
        if (typeof window !== "undefined") {
            localStorage.setItem("token", token);
            localStorage.setItem("user", JSON.stringify(user));
        }
        set({ isLoggedIn: true, token, user });
    },
    clearAuth: () => {
        if (typeof window !== "undefined") {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
        }
        set({ isLoggedIn: false, token: null, user: null });
    },
    initializeFromStorage: () => {
        const token = getStoredToken();
        const user = getStoredUser();
        set({ isLoggedIn: Boolean(token), token, user });
    },
}));
