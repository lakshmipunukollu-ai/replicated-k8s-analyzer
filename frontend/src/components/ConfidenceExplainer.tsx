'use client';
import { useState } from 'react';

interface Signal {
  source: string;
  strength: string;
  contribution: number;
  color: string;
}

interface Props {
  bundleId: string;
  findingId: string;
  confidence: number;
}

import { getAuthHeaders } from '@/lib/api';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';

export default function ConfidenceExplainer({ bundleId, findingId, confidence }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ signals: Signal[]; summary: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (data) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/bundles/${bundleId}/findings/${findingId}/confidence`, { headers: getAuthHeaders() });
      const d = await res.json();
      setData(d);
    } finally { setLoading(false); }
  };

  return (
    <div style={{ display: 'inline-block' }}>
      <button onClick={handleClick} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: '12px', color: '#2563eb', fontWeight: 500,
        textDecoration: 'underline', padding: 0,
      }}>
        {confidence}% confidence
      </button>

      {open && (
        <div style={{ marginTop: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Why {confidence}% confidence?</div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px' }}>✕</button>
          </div>

          {loading && <div style={{ fontSize: '12px', color: '#64748b' }}>Analyzing signals...</div>}

          {data && (
            <>
              {data.signals?.map((sig, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '7px' }}>
                  <div style={{ fontSize: '11px', color: '#475569', width: '160px', flexShrink: 0 }}>{sig.source}</div>
                  <div style={{ flex: 1, height: '18px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden', position: 'relative' as const }}>
                    <div style={{ width: `${(sig.contribution / 40) * 100}%`, height: '100%', background: sig.color, borderRadius: '3px' }} />
                    <span style={{ position: 'absolute' as const, left: '6px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', fontWeight: 600, color: '#fff' }}>
                      {sig.strength}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: sig.color, width: '30px', textAlign: 'right' as const }}>+{sig.contribution}%</div>
                </div>
              ))}
              {data.summary && (
                <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748b', background: '#fff', padding: '6px 10px', borderRadius: '5px', border: '1px solid #f1f5f9' }}>
                  {data.summary}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
