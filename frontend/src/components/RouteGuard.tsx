'use client';

import { usePathname } from 'next/navigation';
import { ProtectedRoute } from './ProtectedRoute';

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/login') return <>{children}</>;
  return <ProtectedRoute>{children}</ProtectedRoute>;
}
