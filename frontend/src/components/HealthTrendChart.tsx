'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface DataPoint {
  bundle_id: string;
  name: string;
  health_score: number;
  date: string;
  finding_count: number;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';

export default function HealthTrendChart() {
  const [points, setPoints] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<DataPoint | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch(`${API}/bundles`)
      .then(r => r.json())
      .then(d => {
        const bundles = (d.bundles || []).filter((b: any) => b.status === 'completed');
        const pts = bundles.map((b: any) => {
          const score = Math.max(0, 100 - (b.finding_count || 0) * 12);
          return {
            bundle_id: b.id,
            name: b.ai_name || b.filename,
            health_score: score,
            date: new Date(b.upload_time + (b.upload_time.endsWith('Z') ? '' : 'Z'))
              .toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            finding_count: b.finding_count || 0,
          };
        }).reverse();
        setPoints(pts);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading || points.length < 2) return null;

  const W = 600, H = 140, PAD = { top: 16, right: 20, bottom: 32, left: 40 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const xScale = (i: number) => PAD.left + (i / (points.length - 1)) * chartW;
  const yScale = (v: number) => PAD.top + chartH - (v / 100) * chartH;

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(p.health_score)}`).join(' ');
  const areaD = `${pathD} L ${xScale(points.length - 1)} ${PAD.top + chartH} L ${PAD.left} ${PAD.top + chartH} Z`;

  const getColor = (score: number) => score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
  const avgScore = Math.round(points.reduce((a, p) => a + p.health_score, 0) / points.length);

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px 20px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>Cluster Health Over Time</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Health score across {points.length} bundles</div>
        </div>
        <div style={{ textAlign: 'right' as const }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: getColor(avgScore) }}>{avgScore}/100</div>
          <div style={{ fontSize: '11px', color: '#94a3b8' }}>avg health</div>
        </div>
      </div>

      <div style={{ position: 'relative' as const }}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
          {[0, 25, 50, 75, 100].map(v => (
            <g key={v}>
              <line x1={PAD.left} y1={yScale(v)} x2={W - PAD.right} y2={yScale(v)}
                stroke="#f1f5f9" strokeWidth="1" />
              <text x={PAD.left - 6} y={yScale(v)} textAnchor="end" dominantBaseline="middle"
                fontSize="9" fill="#94a3b8">{v}</text>
            </g>
          ))}

          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={areaD} fill="url(#areaGrad)" />

          <path d={pathD} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

          {points.map((p, i) => (
            <g key={i}>
              <circle cx={xScale(i)} cy={yScale(p.health_score)} r={hovered?.bundle_id === p.bundle_id ? 6 : 4}
                fill={getColor(p.health_score)} stroke="#fff" strokeWidth="2"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHovered(p)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => router.push(`/bundles/${p.bundle_id}`)}
              />
              <text x={xScale(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="#94a3b8">
                {p.date}
              </text>
            </g>
          ))}

          {hovered && (() => {
            const i = points.findIndex(p => p.bundle_id === hovered.bundle_id);
            const x = xScale(i);
            const y = yScale(hovered.health_score);
            return (
              <g>
                <rect x={x - 70} y={y - 44} width="140" height="36" rx="4"
                  fill="#1e293b" />
                <text x={x} y={y - 30} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#fff">
                  {hovered.health_score}/100
                </text>
                <text x={x} y={y - 18} textAnchor="middle" fontSize="9" fill="#94a3b8">
                  {hovered.name.length > 22 ? hovered.name.slice(0, 22) + '...' : hovered.name}
                </text>
              </g>
            );
          })()}
        </svg>
      </div>
    </div>
  );
}
