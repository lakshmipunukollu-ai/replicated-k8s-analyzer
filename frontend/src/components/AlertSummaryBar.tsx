'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';

export default function AlertSummaryBar() {
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [firings24h, setFirings24h] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [rulesRes, firingsRes] = await Promise.all([
          fetch(`${API}/alerts/rules`),
          fetch(`${API}/alerts/firings`),
        ]);
        if (cancelled) return;
        if (!rulesRes.ok || !firingsRes.ok) {
          setFailed(true);
          return null;
        }
        const rules = await rulesRes.json().catch(() => null);
        const firings = await firingsRes.json().catch(() => null);
        if (cancelled) return;
        if (rules === null || firings === null) {
          setFailed(true);
          return null;
        }
        const rulesList = Array.isArray(rules) ? rules : [];
        const firingsList = Array.isArray(firings) ? firings : [];
        setActiveCount(rulesList.filter((r: { is_active?: boolean }) => r.is_active !== false).length);
        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const recent = firingsList.filter((f: { triggered_at?: string }) => {
          const t = f.triggered_at;
          if (!t) return false;
          return new Date(t.endsWith('Z') ? t : t + 'Z').getTime() >= dayAgo;
        }).length;
        setFirings24h(recent);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (failed || activeCount === null) return null;

  const hasRecentFirings = (firings24h ?? 0) > 0;

  return (
    <Link
      href="/alerts"
      className="block mb-6 py-2 px-4 rounded-lg border text-sm text-left transition hover:opacity-90"
      style={{
        background: hasRecentFirings ? '#fef3c7' : '#f8fafc',
        borderColor: hasRecentFirings ? '#f59e0b' : '#e2e8f0',
        color: hasRecentFirings ? '#92400e' : '#475569',
      }}
    >
      <span className="font-medium">{activeCount} active alert rule{activeCount !== 1 ? 's' : ''}</span>
      <span className="mx-2">·</span>
      <span>{firings24h ?? 0} firing{(firings24h ?? 0) !== 1 ? 's' : ''} in last 24h</span>
    </Link>
  );
}
