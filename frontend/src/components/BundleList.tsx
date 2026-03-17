'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Bundle {
  id: string;
  filename: string;
  file_size: number;
  status: string;
  upload_time: string;
  finding_count: number;
  company_id?: string | null;
  project_id?: string | null;
  company_name?: string | null;
  project_name?: string | null;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const formatTime = (ts: string) => {
  const date = new Date(ts.endsWith('Z') ? ts : ts + 'Z');
  return date.toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
  });
};

function HealthBar({ findingCount }: { bundleId: string; findingCount: number }) {
  const score = Math.max(0, 100 - findingCount * 12);
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '120px' }}>
      <div style={{ flex: 1, height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontSize: '11px', color, fontWeight: 600, minWidth: '52px' }}>{score}/100</span>
    </div>
  );
}

function BundleActions({ bundleId, onDelete, onArchive }: {
  bundleId: string;
  onDelete: () => void;
  onArchive: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirming) { setConfirming(true); setTimeout(() => setConfirming(false), 3000); return; }
    await fetch(`${API}/bundles/${bundleId}`, { method: 'DELETE' }).catch(() => {});
    onDelete();
  };

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`${API}/bundles/${bundleId}/archive`, { method: 'POST' }).catch(() => {});
    onArchive();
  };

  return (
    <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
      <button onClick={handleArchive} style={{ padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: '5px', background: '#fff', color: '#64748b', fontSize: '11px', cursor: 'pointer', fontWeight: 500 }}>
        Archive
      </button>
      <button onClick={handleDelete} style={{
        padding: '4px 10px', border: '1px solid',
        borderColor: confirming ? '#ef4444' : '#e2e8f0',
        borderRadius: '5px',
        background: confirming ? '#fef2f2' : '#fff',
        color: confirming ? '#dc2626' : '#64748b',
        fontSize: '11px', cursor: 'pointer', fontWeight: confirming ? 700 : 400,
      }}>
        {confirming ? 'Confirm?' : 'Delete'}
      </button>
    </div>
  );
}

function AiName({ bundleId, filename }: { bundleId: string; filename: string }) {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/bundles/${bundleId}/ai-name`)
      .then(r => r.json())
      .then(d => setName(d.ai_name))
      .catch(() => {});
  }, [bundleId]);

  if (!name || name === filename) return <span style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>{filename}</span>;

  return (
    <div>
      <div style={{ fontSize: '15px', fontWeight: 700, color: '#1e293b', marginBottom: '2px' }}>{name}</div>
      <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>{filename}</div>
    </div>
  );
}

export default function BundleList({ companyId, projectId }: { companyId?: string; projectId?: string } = {}) {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams();
    if (companyId) params.set('company_id', companyId);
    if (projectId) params.set('project_id', projectId);
    const qs = params.toString();
    const url = `${API}/bundles${qs ? `?${qs}` : ''}`;
    console.log('[BundleList] Fetching bundles:', url);
    fetch(url)
      .then(r => {
        console.log('[BundleList] Response status:', r.status, r.statusText);
        return r.json();
      })
      .then(d => {
        console.log('[BundleList] Parsed data keys:', d ? Object.keys(d) : 'null', 'bundles count:', d?.bundles?.length ?? 0);
        setBundles(d?.bundles ?? []);
      })
      .catch(err => {
        console.warn('[BundleList] Fetch failed:', err);
      })
      .finally(() => setLoading(false));
  }, [companyId, projectId]);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' as const, color: '#64748b' }}>Loading bundles...</div>;
  if (!bundles.length) return (
    <div style={{ textAlign: 'center' as const, padding: '60px', color: '#94a3b8' }}>
      <div style={{ fontSize: '16px', marginBottom: '8px' }}>No bundles uploaded yet</div>
      <div style={{ fontSize: '13px' }}>Upload a support bundle to get started</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '8px' }}>
      {bundles.map(bundle => (
        <div key={bundle.id} onClick={() => router.push(`/bundles/${bundle.id}`)}
          style={{ background: '#fff', border: `1px solid ${hoveredId === bundle.id ? '#93c5fd' : '#e2e8f0'}`, borderRadius: '10px', padding: '16px 20px', cursor: 'pointer', transition: 'all .15s', display: 'flex', alignItems: 'center', gap: '16px' }}
          onMouseEnter={() => setHoveredId(bundle.id)}
          onMouseLeave={() => setHoveredId(null)}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            {bundle.status === 'completed'
              ? <AiName bundleId={bundle.id} filename={bundle.filename} />
              : <span style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>{bundle.filename}</span>
            }
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
              {formatSize(bundle.file_size)} · {formatTime(bundle.upload_time)}
              {(bundle.company_name || bundle.project_name) && (
                <span style={{ display: 'block', marginTop: '2px', color: '#64748b', fontSize: '11px' }}>
                  {[bundle.company_name, bundle.project_name].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
          </div>

          {bundle.status === 'completed' && bundle.finding_count > 0 && (
            <HealthBar bundleId={bundle.id} findingCount={bundle.finding_count} />
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {bundle.status === 'completed' && (
              <span style={{ background: '#f3e8ff', color: '#7c3aed', fontSize: '12px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px' }}>
                {bundle.finding_count} finding{bundle.finding_count !== 1 ? 's' : ''}
              </span>
            )}
            <span style={{
              fontSize: '12px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px',
              background: bundle.status === 'completed' ? '#f0fdf4' : bundle.status === 'analyzing' ? '#eff6ff' : '#fef2f2',
              color: bundle.status === 'completed' ? '#15803d' : bundle.status === 'analyzing' ? '#1d4ed8' : '#dc2626',
            }}>
              {bundle.status === 'completed' ? 'Completed' : bundle.status === 'analyzing' ? 'Analyzing...' : bundle.status}
            </span>
            {hoveredId === bundle.id && bundle.status === 'completed' && (
              <BundleActions
                bundleId={bundle.id}
                onDelete={() => setBundles(prev => prev.filter(b => b.id !== bundle.id))}
                onArchive={() => setBundles(prev => prev.filter(b => b.id !== bundle.id))}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
