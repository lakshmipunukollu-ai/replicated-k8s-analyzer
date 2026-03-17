'use client';
import { useState } from 'react';

export default function ExportReport({ bundleId, filename }: { bundleId: string; filename: string }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [content, setContent] = useState<{ type: string; text: string } | null>(null);

  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';

  const exportAs = async (type: 'slack' | 'jira') => {
    setLoading(type);
    try {
      const res = await fetch(`${API}/bundles/${bundleId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, use_ai_title: true }),
      });
      const data = await res.json();
      setContent({ type, text: data.content });
    } finally { setLoading(null); }
  };

  const copy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content.text);
    setCopied(content.type);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '18px' }}>
      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>Export Report</div>
        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Generate a formatted report ready to paste</div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
        <button onClick={() => exportAs('slack')} disabled={!!loading} style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px',
          background: content?.type === 'slack' ? '#4a154b' : '#fff',
          color: content?.type === 'slack' ? '#fff' : '#374151',
          border: '1px solid', borderColor: content?.type === 'slack' ? '#4a154b' : '#d1d5db',
          borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
        }}>
          {loading === 'slack' ? 'Generating...' : '# Export for Slack'}
        </button>
        <button onClick={() => exportAs('jira')} disabled={!!loading} style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 18px',
          background: content?.type === 'jira' ? '#0052cc' : '#fff',
          color: content?.type === 'jira' ? '#fff' : '#374151',
          border: '1px solid', borderColor: content?.type === 'jira' ? '#0052cc' : '#d1d5db',
          borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
        }}>
          {loading === 'jira' ? 'Generating...' : '◈ Export for Jira'}
        </button>
      </div>

      {content && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
              {content.type === 'slack' ? 'Slack message ready to paste' : 'Jira ticket description ready to paste'}
            </span>
            <button onClick={copy} style={{ padding: '5px 14px', border: '1px solid #e2e8f0', borderRadius: '6px', background: copied ? '#f0fdf4' : '#fff', color: copied ? '#15803d' : '#475569', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
              {copied ? '✓ Copied!' : 'Copy to clipboard'}
            </button>
          </div>
          <pre style={{ fontFamily: 'monospace', fontSize: '11px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px', overflowX: 'auto', maxHeight: '280px', overflowY: 'auto', whiteSpace: 'pre-wrap', color: '#374151', margin: 0 }}>
            {content.text}
          </pre>
        </div>
      )}
    </div>
  );
}
