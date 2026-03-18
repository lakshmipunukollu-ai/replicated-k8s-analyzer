'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const AUTH_TOKEN_KEY = 'auth_token';
const AUTH_USER_KEY = 'auth_user';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  company_id: string | null;
  company_name?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  hydrated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: AuthUser | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadStored(): { token: string | null; user: AuthUser | null } {
  if (typeof window === 'undefined') return { token: null, user: null };
  try {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    const raw = localStorage.getItem(AUTH_USER_KEY);
    const user = raw ? (JSON.parse(raw) as AuthUser) : null;
    return { token, user };
  } catch {
    return { token: null, user: null };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const { token: t, user: u } = loadStored();
    setToken(t);
    setUserState(u);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!token) return;
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';
    fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setUserState(data);
      })
      .catch(() => {});
  }, [token]);

  const login = useCallback(
    async (email: string, password: string) => {
      const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Login failed' }));
        throw new Error(err.detail || 'Login failed');
      }
      const data = await res.json();
      const newToken = data.token;
      const newUser = data.user;
      localStorage.setItem(AUTH_TOKEN_KEY, newToken);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(newUser));
      setToken(newToken);
      setUserState(newUser);
      router.push('/bundles');
    },
    [router]
  );

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    setToken(null);
    setUserState(null);
    router.push('/login');
  }, [router]);

  const setUser = useCallback((u: AuthUser | null) => {
    setUserState(u);
    if (typeof window !== 'undefined' && u) {
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(u));
    } else if (typeof window !== 'undefined') {
      localStorage.removeItem(AUTH_USER_KEY);
    }
  }, []);

  const value: AuthContextValue = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isAdmin: user?.role === 'admin',
    hydrated,
    login,
    logout,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
