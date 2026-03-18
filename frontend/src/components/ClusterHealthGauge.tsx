'use client';
import { useEffect, useState } from 'react';
import { getAuthHeaders } from '@/lib/api';

export interface SummaryData {
  summary: string;
  health_score: number;
  critical_count: number;
  high_count: number;
  total_findings: number;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';

export default function ClusterHealthGauge({
  bundleId,
  data: propData,
  skipFetch,
  loadingGauge,
  loadingSummary,
}: {
  bundleId: string;
  data?: SummaryData | null;
  skipFetch?: boolean;
  /** Findings not ready — show gauge skeleton */
  loadingGauge?: boolean;
  /** Summary text not ready — show AI summary skeleton */
  loadingSummary?: boolean;
}) {
  const [data, setData] = useState<SummaryData | null>(propData ?? null);
  const [loading, setLoading] = useState(!propData && !skipFetch);
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    if (propData) {
      setData(propData);
      setLoading(false);
      return;
    }
    if (skipFetch) {
      setLoading(false);
      return;
    }
    fetch(`${API}/bundles/${bundleId}/summary`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [bundleId, propData, skipFetch]);

  useEffect(() => {
    if (!data || loadingGauge) return;
    let start = 0;
    const target = data.health_score;
    const step = Math.max(target / 60, 0.01);
    const interval = setInterval(() => {
      start += step;
      if (start >= target) {
        setAnimatedScore(target);
        clearInterval(interval);
      } else {
        setAnimatedScore(Math.round(start));
      }
    }, 16);
    return () => clearInterval(interval);
  }, [data, loadingGauge]);

  const getColor = (score: number) => {
    if (score >= 70) return '#10b981';
    if (score >= 40) return '#f59e0b';
    return '#ef4444';
  };

  const getLabel = (score: number) => {
    if (score >= 70) return 'Healthy';
    if (score >= 40) return 'Degraded';
    return 'Critical';
  };

  if (loading) return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '24px', textAlign: 'center' as const }}>
      <div style={{ fontSize: '13px', color: '#64748b' }}>Generating cluster health analysis...</div>
    </div>
  );

  if (!data && !loadingGauge) return null;

  const showGauge = data && !loadingGauge;
  const score = showGauge ? animatedScore : 0;
  const color = showGauge ? getColor(data!.health_score) : '#e5e7eb';
  const r = 54;
  const circ = 2 * Math.PI * r;
  const displayDash = showGauge && score > 0 ? (score / 100) * circ : 0;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 mb-5">
      <div className="flex gap-8 items-center flex-wrap">
        {/* Gauge */}
        <div className="text-center shrink-0">
          {loadingGauge || !data ? (
            <div className="h-24 w-24 rounded-full bg-gray-200 animate-pulse mx-auto" style={{ marginTop: '10px', marginBottom: '10px' }} />
          ) : (
            <svg width="140" height="140" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r={r} fill="none" stroke="#f1f5f9" strokeWidth="12" />
              <circle cx="70" cy="70" r={r} fill="none" stroke={score === 0 ? '#ef4444' : color} strokeWidth="12"
                strokeDasharray={`${displayDash} ${circ}`}
                strokeLinecap="round"
                transform="rotate(-90 70 70)"
                style={{ transition: 'stroke-dashoffset 0.05s linear' }}
              />
              <text x="70" y="62" textAnchor="middle" fontSize="28" fontWeight="700" fill={color}>{score}</text>
              <text x="70" y="78" textAnchor="middle" fontSize="11" fill="#94a3b8">/100</text>
              <text x="70" y="96" textAnchor="middle" fontSize="12" fontWeight="600" fill={color}>{getLabel(data.health_score)}</text>
            </svg>
          )}
          <div className="text-xs font-semibold text-gray-500 mt-1">Cluster Health</div>
        </div>

        {/* Stats */}
        <div className="flex gap-4 shrink-0">
          {loadingGauge || !data ? (
            <>
              <div className="h-[72px] w-[72px] rounded-lg bg-gray-200 animate-pulse" />
              <div className="h-[72px] w-[72px] rounded-lg bg-gray-200 animate-pulse" />
              <div className="h-[72px] w-[72px] rounded-lg bg-gray-200 animate-pulse" />
            </>
          ) : (
            [
              { label: 'Critical', value: data.critical_count, color: '#ef4444', bg: '#fef2f2' },
              { label: 'High', value: data.high_count, color: '#f59e0b', bg: '#fffbeb' },
              { label: 'Total', value: data.total_findings, color: '#6366f1', bg: '#f5f3ff' },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, borderRadius: '8px', padding: '12px 16px', textAlign: 'center' as const, minWidth: '64px' }}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>{s.label}</div>
              </div>
            ))
          )}
        </div>

        {/* Summary */}
        <div className="flex-1 min-w-[200px] border-l border-gray-100 pl-6">
          <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">AI Summary</div>
          {loadingSummary ? (
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4 mb-2" />
              <div className="h-4 bg-gray-200 rounded animate-pulse w-full mb-2" />
              <div className="h-4 bg-gray-200 rounded animate-pulse w-5/6" />
            </div>
          ) : (
            <p className="text-[13px] text-gray-700 leading-relaxed m-0">{data?.summary ?? ''}</p>
          )}
        </div>
      </div>
    </div>
  );
}
