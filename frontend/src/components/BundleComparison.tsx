'use client';
import { useState, useEffect } from 'react';
import { getAuthHeaders } from '@/lib/api';

interface Bundle { id: string; filename: string; finding_count: number; }
interface CompareResult {
  bundle_a: Bundle; bundle_b: Bundle;
  summary: { new: number; resolved: number; degraded: number; unchanged: number };
  new: { title: string; severity?: string; severity_before?: string; severity_after?: string }[];
  resolved: { title: string }[];
  degraded: { title: string; severity_before: string; severity_after: string }[];
}

export default function BundleComparison() {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [selectedA, setSelectedA] = useState('');
  const [selectedB, setSelectedB] = useState('');
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);

  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';

  useEffect(() => {
    fetch(`${API}/bundles`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => setBundles(d.bundles || []))
      .catch(() => setBundles([]));
  }, []);

  const compare = async () => {
    if (!selectedA || !selectedB || selectedA === selectedB) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/bundles/compare`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle_a_id: selectedA, bundle_b_id: selectedB }),
      });
      setResult(await res.json());
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '18px' }}>
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>Bundle Comparison</div>
        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Diff two bundles to see what changed</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '10px', marginBottom: '16px', alignItems: 'end' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Baseline bundle</div>
          <select value={selectedA} onChange={e => setSelectedA(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', background: '#fff', color: '#1e293b', fontWeight: 500 }}>
            <option value="" style={{ color: '#94a3b8' }}>Select bundle...</option>
            {bundles.map(b => <option key={b.id} value={b.id} style={{ color: '#1e293b' }}>{b.filename} ({b.finding_count} findings)</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Incident bundle</div>
          <select value={selectedB} onChange={e => setSelectedB(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', background: '#fff', color: '#1e293b', fontWeight: 500 }}>
            <option value="" style={{ color: '#94a3b8' }}>Select bundle...</option>
            {bundles.map(b => <option key={b.id} value={b.id} style={{ color: '#1e293b' }}>{b.filename} ({b.finding_count} findings)</option>)}
          </select>
        </div>
        <button onClick={compare} disabled={!selectedA || !selectedB || selectedA === selectedB || loading}
          style={{ padding: '8px 20px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', height: '36px' }}>
          {loading ? 'Comparing...' : 'Compare'}
        </button>
      </div>

      {result && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
            {[
              { label: 'New', count: result.summary.new, color: '#ef4444', bg: '#fef2f2' },
              { label: 'Resolved', count: result.summary.resolved, color: '#10b981', bg: '#f0fdf4' },
              { label: 'Degraded', count: result.summary.degraded, color: '#f59e0b', bg: '#fffbeb' },
              { label: 'Unchanged', count: result.summary.unchanged, color: '#64748b', bg: '#f8fafc' },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, borderRadius: '6px', padding: '10px 14px', textAlign: 'center' as const }}>
                <div style={{ fontSize: '22px', fontWeight: 700, color: s.color }}>{s.count}</div>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {result.new.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', background: '#fef2f2', borderRadius: '6px', borderLeft: '3px solid #ef4444' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#991b1b', minWidth: '40px' }}>NEW</span>
                <span style={{ fontSize: '13px', color: '#1e293b' }}>{f.title}</span>
                <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: 'auto' }}>{f.severity}</span>
              </div>
            ))}
            {result.resolved.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', background: '#f0fdf4', borderRadius: '6px', borderLeft: '3px solid #10b981' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#166534', minWidth: '40px' }}>FIXED</span>
                <span style={{ fontSize: '13px', color: '#1e293b' }}>{f.title}</span>
              </div>
            ))}
            {result.degraded.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', background: '#fffbeb', borderRadius: '6px', borderLeft: '3px solid #f59e0b' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#92400e', minWidth: '40px' }}>WORSE</span>
                <span style={{ fontSize: '13px', color: '#1e293b' }}>{f.title}</span>
                <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: 'auto' }}>{f.severity_before} → {f.severity_after}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
