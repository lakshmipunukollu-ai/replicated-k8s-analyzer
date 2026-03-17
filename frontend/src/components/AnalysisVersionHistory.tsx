'use client';
import { useEffect, useState } from 'react';

interface Version {
  version_number: number;
  finding_count: number;
  health_score: number;
  created_at: string;
  is_current: boolean;
  findings_snapshot: { title: string; severity: string }[];
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';

export default function AnalysisVersionHistory({ bundleId, onReanalyze }: { bundleId: string; onReanalyze?: () => void }) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = () => {
    fetch(`${API}/bundles/${bundleId}/versions`)
      .then(r => r.json())
      .then(d => { setVersions(d.versions || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, [bundleId]);

  const handleReanalyze = async () => {
    setReanalyzing(true);
    try {
      await fetch(`${API}/bundles/${bundleId}/reanalyze`, { method: 'POST' });
      setTimeout(() => {
        setReanalyzing(false);
        onReanalyze?.();
        load();
      }, 20000);
    } catch {
      setReanalyzing(false);
    }
  };

  const getHealthColor = (score: number) => score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';

  const getDiff = (current: Version, prev: Version) => {
    const added = current.finding_count - prev.finding_count;
    if (added > 0) return { text: `+${added} new findings`, color: '#ef4444' };
    if (added < 0) return { text: `${added} findings resolved`, color: '#10b981' };
    return { text: 'No change', color: '#94a3b8' };
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>Analysis History</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Re-run to discover new patterns</div>
        </div>
        <button onClick={handleReanalyze} disabled={reanalyzing} style={{
          padding: '7px 16px', background: reanalyzing ? '#94a3b8' : '#1e3a5f',
          color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px',
          fontWeight: 600, cursor: reanalyzing ? 'not-allowed' : 'pointer',
        }}>
          {reanalyzing ? '⟳ Analyzing...' : '↻ Re-analyze'}
        </button>
      </div>

      {reanalyzing && (
        <div style={{ padding: '12px 18px', background: '#eff6ff', borderBottom: '1px solid #bfdbfe', fontSize: '13px', color: '#1d4ed8' }}>
          ⟳ Re-analyzing bundle with latest AI patterns — results in ~20 seconds...
        </div>
      )}

      <div style={{ padding: '8px 0' }}>
        {loading && <div style={{ padding: '16px 18px', color: '#64748b', fontSize: '13px' }}>Loading history...</div>}
        {!loading && versions.map((v, i) => (
          <div key={v.version_number}>
            <div
              onClick={() => setExpanded(expanded === v.version_number ? null : v.version_number)}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 18px', cursor: 'pointer', borderBottom: '1px solid #f8fafc', transition: 'background .15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: v.is_current ? '#2563eb' : '#cbd5e1', flexShrink: 0 }} />

              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>v{v.version_number}</span>
                  {v.is_current && <span style={{ fontSize: '10px', background: '#dbeafe', color: '#1d4ed8', padding: '1px 7px', borderRadius: '10px', fontWeight: 600 }}>Current</span>}
                  {i > 0 && !v.is_current && (() => {
                    const diff = getDiff(versions[i - 1], v);
                    return <span style={{ fontSize: '11px', color: diff.color, fontWeight: 500 }}>{diff.text}</span>;
                  })()}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                  {v.created_at ? new Date((v.created_at.endsWith('Z') ? v.created_at : v.created_at + 'Z')).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                </div>
              </div>

              <div style={{ textAlign: 'right' as const }}>
                <div style={{ fontSize: '15px', fontWeight: 700, color: getHealthColor(v.health_score) }}>{v.health_score}/100</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{v.finding_count} findings</div>
              </div>

              <div style={{ color: '#94a3b8', fontSize: '12px' }}>{expanded === v.version_number ? '▲' : '▼'}</div>
            </div>

            {expanded === v.version_number && v.findings_snapshot?.length > 0 && (
              <div style={{ padding: '8px 18px 12px 40px', background: '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                {v.findings_snapshot.slice(0, 5).map((f, j) => (
                  <div key={j} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: f.severity === 'critical' ? '#991b1b' : f.severity === 'high' ? '#92400e' : '#475569', background: f.severity === 'critical' ? '#fee2e2' : f.severity === 'high' ? '#fef3c7' : '#f1f5f9', padding: '1px 6px', borderRadius: '4px', textTransform: 'uppercase' as const }}>{f.severity}</span>
                    <span style={{ fontSize: '12px', color: '#374151' }}>{f.title}</span>
                  </div>
                ))}
                {v.findings_snapshot.length > 5 && (
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>+{v.findings_snapshot.length - 5} more findings</div>
                )}
              </div>
            )}
          </div>
        ))}
        {!loading && versions.length === 0 && (
          <div style={{ padding: '16px 18px', color: '#94a3b8', fontSize: '13px' }}>No analysis history yet</div>
        )}
      </div>
    </div>
  );
}
