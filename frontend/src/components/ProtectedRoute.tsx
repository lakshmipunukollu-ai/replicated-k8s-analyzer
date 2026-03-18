'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hydrated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!hydrated) return;
    if (!isAuthenticated) {
      router.replace('/login');
    }
  }, [hydrated, isAuthenticated, router]);

  if (!hydrated || !isAuthenticated) return null;
  return <>{children}</>;
}
