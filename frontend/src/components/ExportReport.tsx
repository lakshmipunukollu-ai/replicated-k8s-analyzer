'use client';
import { useState, useEffect } from 'react';
import { getAuthHeaders } from '@/lib/api';

interface Finding { id: string; title?: string; severity?: string; }

export default function ExportReport({ bundleId }: { bundleId: string; filename: string }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [content, setContent] = useState<{ type: string; text: string } | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [selectedFindingIds, setSelectedFindingIds] = useState<Set<string>>(new Set());
  const [githubRepo, setGithubRepo] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [escalateLoading, setEscalateLoading] = useState(false);
  const [escalateSuccess, setEscalateSuccess] = useState<{ issue_url: string; issue_number: number } | null>(null);
  const [escalateError, setEscalateError] = useState<string | null>(null);

  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';

  useEffect(() => {
    fetch(`${API}/bundles/${bundleId}/report`, { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((data) => {
        const list = (data.findings || []) as Finding[];
        setFindings(list);
        const criticalHigh = new Set(list.filter((f: Finding) => f.severity === 'critical' || f.severity === 'high').map((f: Finding) => f.id));
        setSelectedFindingIds(criticalHigh);
      })
      .catch(() => {});
  }, [bundleId]);

  const toggleFinding = (id: string) => {
    setSelectedFindingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportAs = async (type: 'slack' | 'jira') => {
    setLoading(type);
    try {
      const res = await fetch(`${API}/bundles/${bundleId}/export`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
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

      <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>Escalate to Engineering</div>
        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>Create a GitHub issue with selected findings</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>GitHub repo (e.g. myorg/myrepo)</label>
            <input
              type="text"
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
              placeholder="org/repo"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', color: '#1e293b', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>GitHub token</label>
            <input
              type="password"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder="ghp_..."
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', color: '#1e293b', boxSizing: 'border-box' }}
            />
          </div>
        </div>
        {findings.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Findings to include</div>
            <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px', background: '#f8fafc' }}>
              {findings.map((f) => (
                <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', cursor: 'pointer', fontSize: '12px' }}>
                  <input
                    type="checkbox"
                    checked={selectedFindingIds.has(f.id)}
                    onChange={() => toggleFinding(f.id)}
                  />
                  <span style={{ color: f.severity === 'critical' ? '#b91c1c' : f.severity === 'high' ? '#b45309' : '#475569' }}>{f.severity}</span>
                  <span style={{ color: '#1e293b', flex: 1 }}>{f.title || 'Finding'}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <button
          onClick={async () => {
            setEscalateError(null);
            setEscalateSuccess(null);
            if (!githubRepo.trim() || !githubToken.trim()) {
              setEscalateError('GitHub repo and token are required');
              return;
            }
            setEscalateLoading(true);
            try {
              const res = await fetch(`${API}/bundles/${bundleId}/escalate`, {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  platform: 'github',
                  github_repo: githubRepo.trim(),
                  github_token: githubToken.trim(),
                  finding_ids: selectedFindingIds.size > 0 ? Array.from(selectedFindingIds) : undefined,
                }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.detail || 'Failed to create issue');
              setEscalateSuccess({ issue_url: data.issue_url, issue_number: data.issue_number });
            } catch (e) {
              setEscalateError(e instanceof Error ? e.message : 'Failed to create issue');
            } finally {
              setEscalateLoading(false);
            }
          }}
          disabled={escalateLoading}
          style={{
            padding: '8px 16px',
            background: '#1e3a5f',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: escalateLoading ? 'not-allowed' : 'pointer',
          }}
        >
          {escalateLoading ? 'Creating...' : 'Create GitHub Issue'}
        </button>
        {escalateError && (
          <div style={{ marginTop: '10px', padding: '10px', background: '#fef2f2', color: '#b91c1c', borderRadius: '6px', fontSize: '12px' }}>
            {escalateError}
          </div>
        )}
        {escalateSuccess && escalateSuccess.issue_url && (
          <div style={{ marginTop: '10px', padding: '12px', background: '#f0fdf4', border: '1px solid #86efac', color: '#15803d', borderRadius: '6px', fontSize: '13px' }}>
            <strong>Issue created.</strong>{' '}
            <a href={escalateSuccess.issue_url} target="_blank" rel="noopener noreferrer" style={{ color: '#15803d', fontWeight: 600 }}>
              Open issue #{escalateSuccess.issue_number} →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
