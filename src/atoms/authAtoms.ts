import { atom } from "jotai";

export type AuthState = "checking" | "authenticated" | "unauthenticated";

// Auth state - starts as "checking" until we verify token
export const authStateAtom = atom<AuthState>("checking");

// Current user info (from /api/auth/me)
export const currentUserAtom = atom<{ id: number; email: string } | null>(null);
