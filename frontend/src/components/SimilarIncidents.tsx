'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Similar {
  bundle_id: string;
  ai_name: string;
  filename: string;
  match_score: number;
  finding_count: number;
  health_score: number;
  upload_time: string;
  shared_findings: string[];
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';

export default function SimilarIncidents({ bundleId }: { bundleId: string }) {
  const [similar, setSimilar] = useState<Similar[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch(`${API}/bundles/${bundleId}/similar`)
      .then(r => r.json())
      .then(d => { setSimilar(d.similar || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [bundleId]);

  if (loading) return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px 20px' }}>
      <div style={{ fontSize: '13px', color: '#64748b' }}>Finding similar incidents...</div>
    </div>
  );

  if (!similar.length) return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px 20px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>No similar incidents found</div>
      <div style={{ fontSize: '12px', color: '#64748b' }}>Upload more bundles to enable pattern matching</div>
    </div>
  );

  const getScoreColor = (score: number) => score >= 70 ? '#ef4444' : score >= 40 ? '#f59e0b' : '#6366f1';

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>We&apos;ve seen this before</div>
        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{similar.length} similar incident{similar.length !== 1 ? 's' : ''} found in your history</div>
      </div>
      <div style={{ padding: '8px 0' }}>
        {similar.map((s, i) => (
          <div key={s.bundle_id}
            onClick={() => router.push(`/bundles/${s.bundle_id}`)}
            style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 18px', cursor: 'pointer', borderBottom: i < similar.length - 1 ? '1px solid #f8fafc' : 'none', transition: 'background .15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ textAlign: 'center' as const, minWidth: '52px' }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: getScoreColor(s.match_score) }}>{s.match_score}%</div>
              <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 500 }}>match</div>
            </div>

            <div style={{ width: '60px', flexShrink: 0 }}>
              <div style={{ height: '5px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${s.match_score}%`, height: '100%', background: getScoreColor(s.match_score), borderRadius: '3px' }} />
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', marginBottom: '2px' }}>{s.ai_name}</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>{s.filename}</div>
              {s.shared_findings?.length > 0 && (
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  Shared: {s.shared_findings.slice(0, 2).map(f => {
                    const words = f.split(' ').slice(0, 3).join(' ');
                    return words;
                  }).join(' · ')}
                </div>
              )}
            </div>

            <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>{s.finding_count} findings</div>
              <div style={{ fontSize: '11px', color: s.health_score < 40 ? '#ef4444' : s.health_score < 70 ? '#f59e0b' : '#10b981', fontWeight: 600 }}>{s.health_score}/100</div>
            </div>
            <div style={{ color: '#94a3b8', fontSize: '14px' }}>→</div>
          </div>
        ))}
      </div>
    </div>
  );
}
