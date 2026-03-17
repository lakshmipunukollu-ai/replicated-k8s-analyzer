'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';

interface BundleRow {
  id: string;
  filename: string;
  status: string;
  upload_time: string;
  company_name?: string | null;
  project_name?: string | null;
  triage_status?: string | null;
  assigned_to?: string | null;
  assigned_at?: string | null;
  resolved_at?: string | null;
}

const STATUS_OPTIONS = ['unassigned', 'open', 'in_progress', 'resolved'] as const;
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  unassigned: { bg: '#f1f5f9', color: '#475569' },
  open: { bg: '#dbeafe', color: '#1d4ed8' },
  in_progress: { bg: '#fef3c7', color: '#92400e' },
  resolved: { bg: '#dcfce7', color: '#15803d' },
};

function formatAge(uploadTime: string) {
  const date = new Date(uploadTime.endsWith('Z') ? uploadTime : uploadTime + 'Z');
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return 'Just now';
}

export default function TriagePage() {
  const [bundles, setBundles] = useState<BundleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unassigned' | 'in_progress' | 'resolved'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [assignTo, setAssignTo] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetch(`${API}/bundles`)
      .then((r) => r.json())
      .then((d) => setBundles((d.bundles || []).sort((a: BundleRow, b: BundleRow) => new Date(b.upload_time).getTime() - new Date(a.upload_time).getTime())))
      .catch(() => setBundles([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = bundles.filter((b) => {
    const status = b.triage_status || 'unassigned';
    if (filter === 'all') return true;
    if (filter === 'unassigned') return status === 'unassigned';
    if (filter === 'in_progress') return status === 'in_progress' || status === 'open';
    if (filter === 'resolved') return status === 'resolved';
    return true;
  });

  const handleTriageChange = async (bundleId: string, triage_status: string, assigned_to: string) => {
    try {
      const res = await fetch(`${API}/bundles/${bundleId}/triage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triage_status, assigned_to: assigned_to || undefined }),
      });
      if (!res.ok) return;
      const updated = await res.json();
      setBundles((prev) =>
        prev.map((b) => (b.id === bundleId ? { ...b, triage_status: updated.triage_status, assigned_to: updated.assigned_to } : b))
      );
      setEditingId(null);
      setAssignTo('');
    } catch {
      // ignore
    }
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading triage queue...</div>;

  return (
    <div>
      <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>Triage Queue</h1>
      <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>Manage bundle status and assignment</p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {(['all', 'unassigned', 'in_progress', 'resolved'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              border: `1px solid ${filter === f ? '#1e3a5f' : '#e2e8f0'}`,
              background: filter === f ? '#1e3a5f' : '#fff',
              color: filter === f ? '#fff' : '#475569',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {f === 'all' ? 'All' : f === 'in_progress' ? 'In Progress' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: '#475569' }}>Bundle</th>
              <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: '#475569' }}>Company</th>
              <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: '#475569' }}>Project</th>
              <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: '#475569' }}>Status</th>
              <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: '#475569' }}>Assigned To</th>
              <th style={{ textAlign: 'left', padding: '12px 16px', fontWeight: 600, color: '#475569' }}>Age</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => {
              const status = b.triage_status || 'unassigned';
              const style = STATUS_STYLE[status] || STATUS_STYLE.unassigned;
              const isEditing = editingId === b.id;
              return (
                <tr
                  key={b.id}
                  style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                  onClick={() => router.push(`/bundles/${b.id}`)}
                >
                  <td style={{ padding: '12px 16px', color: '#1e293b', fontWeight: 500 }}>{b.filename}</td>
                  <td style={{ padding: '12px 16px', color: '#64748b' }}>{b.company_name || '—'}</td>
                  <td style={{ padding: '12px 16px', color: '#64748b' }}>{b.project_name || '—'}</td>
                  <td style={{ padding: '12px 16px' }} onClick={(e) => e.stopPropagation()}>
                    {!isEditing ? (
                      <button
                        onClick={() => { setEditingId(b.id); setAssignTo(b.assigned_to || ''); }}
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '3px 10px',
                          borderRadius: '12px',
                          border: 'none',
                          background: style.bg,
                          color: style.color,
                          cursor: 'pointer',
                          textTransform: 'capitalize',
                        }}
                      >
                        {status.replace('_', ' ')}
                      </button>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <select
                          id={`status-${b.id}`}
                          defaultValue={status}
                          style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid #e2e8f0', borderRadius: '4px', minWidth: '120px' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s.replace('_', ' ')}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder="Assign to..."
                          value={assignTo}
                          onChange={(e) => setAssignTo(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ padding: '4px 8px', fontSize: '12px', border: '1px solid #e2e8f0', borderRadius: '4px', width: '120px' }}
                        />
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const sel = document.getElementById(`status-${b.id}`) as HTMLSelectElement;
                              handleTriageChange(b.id, sel?.value || status, assignTo);
                            }}
                            style={{ padding: '2px 8px', fontSize: '11px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                          >
                            Save
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingId(null); setAssignTo(''); }}
                            style={{ padding: '2px 8px', fontSize: '11px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#64748b' }}>{b.assigned_to || '—'}</td>
                  <td style={{ padding: '12px 16px', color: '#64748b' }}>{formatAge(b.upload_time)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>No bundles match the filter</div>
        )}
      </div>
    </div>
  );
}
