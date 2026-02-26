import type { User } from "@/types";
import { atom } from "jotai";

export type AuthState = "checking" | "authenticated" | "unauthenticated";

// Auth state - starts as "checking" until we verify token
export const authStateAtom = atom<AuthState>("checking");

// Current user info (from /api/auth/me). Role is set by Entra SSO (MR !22).
export const currentUserAtom = atom<User | null>(null);
