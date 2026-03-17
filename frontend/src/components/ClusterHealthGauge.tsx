'use client';
import { useEffect, useState } from 'react';

interface SummaryData {
  summary: string;
  health_score: number;
  critical_count: number;
  high_count: number;
  total_findings: number;
}

export default function ClusterHealthGauge({ bundleId }: { bundleId: string }) {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
    fetch(`${API}/bundles/${bundleId}/summary`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLoading(false);
        let start = 0;
        const target = d.health_score;
        const step = target / 60;
        const interval = setInterval(() => {
          start += step;
          if (start >= target) { setAnimatedScore(target); clearInterval(interval); }
          else setAnimatedScore(Math.round(start));
        }, 16);
      })
      .catch(() => setLoading(false));
  }, [bundleId]);

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

  if (!data) return null;

  const score = animatedScore;
  const color = getColor(data.health_score);
  const r = 54;
  const circ = 2 * Math.PI * r;
  const dashOffset = circ - (score / 100) * circ;

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px 24px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
        {/* Gauge */}
        <div style={{ textAlign: 'center' as const, flexShrink: 0 }}>
          <svg width="140" height="140" viewBox="0 0 140 140">
            <circle cx="70" cy="70" r={r} fill="none" stroke="#f1f5f9" strokeWidth="12" />
            <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="12"
              strokeDasharray={circ} strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform="rotate(-90 70 70)"
              style={{ transition: 'stroke-dashoffset 0.05s linear' }}
            />
            <text x="70" y="62" textAnchor="middle" fontSize="28" fontWeight="700" fill={color}>{score}</text>
            <text x="70" y="78" textAnchor="middle" fontSize="11" fill="#94a3b8">/100</text>
            <text x="70" y="96" textAnchor="middle" fontSize="12" fontWeight="600" fill={color}>{getLabel(data.health_score)}</text>
          </svg>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginTop: '4px' }}>Cluster Health</div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: '16px', flexShrink: 0 }}>
          {[
            { label: 'Critical', value: data.critical_count, color: '#ef4444', bg: '#fef2f2' },
            { label: 'High', value: data.high_count, color: '#f59e0b', bg: '#fffbeb' },
            { label: 'Total', value: data.total_findings, color: '#6366f1', bg: '#f5f3ff' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: '8px', padding: '12px 16px', textAlign: 'center' as const, minWidth: '64px' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div style={{ flex: 1, borderLeft: '1px solid #f1f5f9', paddingLeft: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '8px' }}>AI Summary</div>
          <p style={{ fontSize: '13px', color: '#374151', lineHeight: '1.7', margin: 0 }}>{data.summary}</p>
        </div>
      </div>
    </div>
  );
}
