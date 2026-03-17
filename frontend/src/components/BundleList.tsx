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

function HealthBar({ bundleId, findingCount }: { bundleId: string; findingCount: number }) {
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

export default function BundleList() {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch(`${API}/bundles`)
      .then(r => r.json())
      .then(d => { setBundles(d.bundles || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

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
          style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px 20px', cursor: 'pointer', transition: 'all .15s', display: 'flex', alignItems: 'center', gap: '16px' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#93c5fd')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            {bundle.status === 'completed'
              ? <AiName bundleId={bundle.id} filename={bundle.filename} />
              : <span style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>{bundle.filename}</span>
            }
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
              {formatSize(bundle.file_size)} · {formatTime(bundle.upload_time)}
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
          </div>
        </div>
      ))}
    </div>
  );
}
