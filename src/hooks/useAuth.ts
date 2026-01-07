import {
  type AuthState,
  authStateAtom,
  currentUserAtom,
} from "@/atoms/authAtoms";
import { getClient } from "@/client/api/client_factory";
import { useAtom, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";

export function useAuth() {
  const [authState, setAuthState] = useAtom(authStateAtom);
  const [currentUser, setCurrentUser] = useAtom(currentUserAtom);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem("accessToken");

    if (!token) {
      setAuthState("unauthenticated");
      setCurrentUser(null);
      return;
    }

    try {
      const client = getClient();
      const user = await client.getCurrentUser();
      setCurrentUser(user);
      setAuthState("authenticated");
    } catch {
      // Token invalid or expired
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      setAuthState("unauthenticated");
      setCurrentUser(null);
    }
  }, [setAuthState, setCurrentUser]);

  const logout = useCallback(async () => {
    try {
      const client = getClient();
      await client.logout();
    } catch {
      // Ignore errors, just clear local state
    }
    setAuthState("unauthenticated");
    setCurrentUser(null);
  }, [setAuthState, setCurrentUser]);

  return {
    authState,
    currentUser,
    isAuthenticated: authState === "authenticated",
    isChecking: authState === "checking",
    checkAuth,
    logout,
  };
}

export function useAuthCheck() {
  const { checkAuth, authState } = useAuth();

  useEffect(() => {
    if (authState === "checking") {
      checkAuth();
    }
  }, [authState, checkAuth]);

  return authState;
}
