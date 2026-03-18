'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthHeaders } from '@/lib/api';

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

function BundleActions({ bundleId, onDelete, onArchive, onRestore, onDeleteClick, isArchivedView }: {
  bundleId: string;
  onDelete: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDeleteClick: () => void;
  isArchivedView: boolean;
}) {
  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`${API}/bundles/${bundleId}/archive`, { method: 'PATCH', headers: getAuthHeaders() }).catch(() => {});
    onArchive();
  };

  const handleRestore = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`${API}/bundles/${bundleId}/restore`, { method: 'PATCH', headers: getAuthHeaders() }).catch(() => {});
    onRestore();
  };

  if (isArchivedView) {
    return (
      <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        <button onClick={handleRestore} style={{ padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: '5px', background: '#fff', color: '#475569', fontSize: '11px', cursor: 'pointer', fontWeight: 500 }}>
          Restore
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDeleteClick(); }} style={{ padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: '5px', background: '#dc2626', color: '#fff', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}>
          Delete Forever
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
      <button onClick={handleArchive} style={{ padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: '5px', background: '#fff', color: '#64748b', fontSize: '11px', cursor: 'pointer', fontWeight: 500 }}>
        Archive
      </button>
      <button onClick={(e) => { e.stopPropagation(); onDeleteClick(); }} style={{ padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: '5px', background: '#fff', color: '#64748b', fontSize: '11px', cursor: 'pointer', fontWeight: 500 }}>
        Delete
      </button>
    </div>
  );
}

function AiName({ bundleId, filename }: { bundleId: string; filename: string }) {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/bundles/${bundleId}/ai-name`, { headers: getAuthHeaders() })
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

export default function BundleList({ companyId, projectId, includeArchived }: { companyId?: string; projectId?: string; includeArchived?: boolean } = {}) {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [deleteModalBundle, setDeleteModalBundle] = useState<Bundle | null>(null);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams();
    if (companyId) params.set('company_id', companyId);
    if (projectId) params.set('project_id', projectId);
    if (includeArchived) params.set('include_archived', 'true');
    const qs = params.toString();
    const url = `${API}/bundles${qs ? `?${qs}` : ''}`;
    fetch(url, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => setBundles(d?.bundles ?? []))
      .catch(() => setBundles([]))
      .finally(() => setLoading(false));
  }, [companyId, projectId, includeArchived]);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' as const, color: '#64748b' }}>Loading bundles...</div>;
  if (!bundles.length) return (
    <div style={{ textAlign: 'center' as const, padding: '60px', color: '#94a3b8' }}>
      <div style={{ fontSize: '16px', marginBottom: '8px' }}>{includeArchived ? 'No archived bundles' : 'No bundles uploaded yet'}</div>
      <div style={{ fontSize: '13px' }}>{includeArchived ? 'Archive bundles from the main list to see them here.' : 'Upload a support bundle to get started'}</div>
    </div>
  );

  const confirmDelete = async () => {
    if (!deleteModalBundle) return;
    setDeleting(true);
    try {
      await fetch(`${API}/bundles/${deleteModalBundle.id}`, { method: 'DELETE', headers: getAuthHeaders() });
      setBundles(prev => prev.filter(b => b.id !== deleteModalBundle.id));
      setDeleteModalBundle(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      {deleteModalBundle && (
        <div role="dialog" aria-modal="true" aria-labelledby="delete-modal-title" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }} onClick={() => !deleting && setDeleteModalBundle(null)}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '400px', width: '90%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }} onClick={e => e.stopPropagation()}>
            <h2 id="delete-modal-title" style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b', margin: '0 0 12px 0' }}>Delete this bundle permanently?</h2>
            <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 20px 0', lineHeight: 1.5 }}>This cannot be undone.</p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => !deleting && setDeleteModalBundle(null)} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', color: '#475569', fontSize: '14px', fontWeight: 600, cursor: deleting ? 'not-allowed' : 'pointer' }}>Cancel</button>
              <button type="button" onClick={confirmDelete} disabled={deleting} style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', background: '#dc2626', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: deleting ? 'not-allowed' : 'pointer' }}>{deleting ? 'Deleting…' : 'Delete Forever'}</button>
            </div>
          </div>
        </div>
      )}
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
              background: bundle.status === 'completed' ? '#f0fdf4' : bundle.status === 'analyzing' ? '#eff6ff' : bundle.status === 'archived' ? '#f1f5f9' : '#fef2f2',
              color: bundle.status === 'completed' ? '#15803d' : bundle.status === 'analyzing' ? '#1d4ed8' : bundle.status === 'archived' ? '#64748b' : '#dc2626',
            }}>
              {bundle.status === 'completed' ? 'Completed' : bundle.status === 'analyzing' ? 'Analyzing...' : bundle.status === 'archived' ? 'Archived' : bundle.status}
            </span>
            {hoveredId === bundle.id && (
              <BundleActions
                bundleId={bundle.id}
                onDelete={() => setBundles(prev => prev.filter(b => b.id !== bundle.id))}
                onArchive={() => setBundles(prev => prev.filter(b => b.id !== bundle.id))}
                onRestore={() => setBundles(prev => prev.filter(b => b.id !== bundle.id))}
                onDeleteClick={() => setDeleteModalBundle(bundle)}
                isArchivedView={!!includeArchived}
              />
            )}
          </div>
        </div>
      ))}
    </div>
    </>
  );
}
