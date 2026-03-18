'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

export function NavBar() {
  const { user, isAdmin, logout } = useAuth();

  return (
    <nav className="bg-white border-b shadow-sm">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg text-gray-900">
          K8s Bundle Analyzer
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              <Link href="/" className="text-gray-600 hover:text-gray-900">Upload</Link>
              <Link href="/bundles" className="text-gray-600 hover:text-gray-900">Dashboard</Link>
              <Link href="/search" className="text-gray-600 hover:text-gray-900">Search</Link>
              <Link href="/patterns" className="text-gray-600 hover:text-gray-900">Patterns</Link>
              <Link href="/triage" className="text-gray-600 hover:text-gray-900">Triage</Link>
              {isAdmin && (
                <>
                  <Link href="/companies" className="text-gray-600 hover:text-gray-900">Companies</Link>
                  <Link href="/alerts" className="text-gray-600 hover:text-gray-900">Alerts</Link>
                  <Link href="/suppression" className="text-gray-600 hover:text-gray-900">Suppression</Link>
                  <Link href="/users" className="text-gray-600 hover:text-gray-900">Users</Link>
                </>
              )}
              <span className="text-gray-500">
                {user.company_name && (
                  <span className="mr-2 px-2 py-0.5 bg-slate-100 rounded text-xs">{user.company_name}</span>
                )}
                <span className="font-medium text-gray-700">{user.name || user.email}</span>
                <span className="ml-1 px-2 py-0.5 bg-gray-200 rounded text-xs">{user.role === 'admin' ? 'Admin' : 'Company'}</span>
              </span>
              <button
                type="button"
                onClick={() => logout()}
                className="text-gray-600 hover:text-gray-900"
              >
                Sign Out
              </button>
            </>
          ) : (
            <Link href="/login" className="text-gray-600 hover:text-gray-900">Sign In</Link>
          )}
        </div>
      </div>
    </nav>
  );
}
