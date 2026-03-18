'use client';
import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthHeaders } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';

interface Result {
  finding_id: string;
  bundle_id: string;
  bundle_name: string;
  filename: string;
  title: string;
  title_highlighted: string;
  description_highlighted: string;
  severity: string;
  score: number;
  upload_time: string;
}

const SEV_STYLE: Record<string, { bg: string; color: string }> = {
  critical: { bg: '#fee2e2', color: '#991b1b' },
  high: { bg: '#fef3c7', color: '#92400e' },
  medium: { bg: '#ede9fe', color: '#6d28d9' },
  low: { bg: '#dcfce7', color: '#15803d' },
};

function Highlighted({ text }: { text: string }) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return (
    <span>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
          ? <mark key={i} style={{ background: '#fef9c3', color: '#854d0e', padding: '0 2px', borderRadius: '2px' }}>{part.slice(2, -2)}</mark>
          : <span key={i}>{part}</span>
      )}
    </span>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const router = useRouter();

  const search = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/bundles/search?q=${encodeURIComponent(q)}`, { headers: getAuthHeaders() });
      const data = await res.json();
      setResults(data.results || []);
      setTotal(data.total || 0);
      setSearched(true);
    } finally { setLoading(false); }
  }, []);

  const formatDate = (ts: string) => {
    if (!ts) return '';
    const date = new Date(ts.endsWith('Z') ? ts : ts + 'Z');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 24px' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>Search Bundles</h1>
      <p style={{ color: '#64748b', margin: '0 0 24px 0', fontSize: '13px' }}>Search findings across all uploaded bundles</p>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search(query)}
          placeholder="Search findings... e.g. OOMKill, etcd, memory pressure"
          style={{ flex: 1, padding: '10px 16px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', color: '#1e293b', outline: 'none' }}
        />
        <button onClick={() => search(query)} disabled={loading} style={{
          padding: '10px 24px', background: '#1e3a5f', color: '#fff',
          border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
        }}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {searched && (
        <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
          {total > 0 ? `${total} result${total !== 1 ? 's' : ''} for "${query}"` : `No results for "${query}"`}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '8px' }}>
        {results.map((r, i) => {
          const sevStyle = SEV_STYLE[r.severity] || SEV_STYLE.low;
          return (
            <div key={i} onClick={() => router.push(`/bundles/${r.bundle_id}`)}
              style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px 18px', cursor: 'pointer', transition: 'border-color .15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#93c5fd')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', textTransform: 'uppercase' as const, background: sevStyle.bg, color: sevStyle.color }}>
                  {r.severity}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                  <Highlighted text={r.title_highlighted} />
                </span>
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>
                <Highlighted text={r.description_highlighted} />
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: 600, color: '#475569' }}>{r.bundle_name}</span>
                <span>·</span>
                <span>{r.filename}</span>
                <span>·</span>
                <span>{formatDate(r.upload_time)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {searched && results.length === 0 && (
        <div style={{ textAlign: 'center' as const, padding: '40px', color: '#94a3b8', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          No findings match your search
        </div>
      )}
    </div>
  );
}
