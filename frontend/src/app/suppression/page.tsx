'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';

interface Company { id: string; name: string; slug: string; }
interface SuppressionRuleRow {
  id: string;
  company_id: string | null;
  company_name: string | null;
  pattern: string;
  reason: string | null;
  created_by: string;
  is_active: boolean;
  created_at: string | null;
}
interface CrossCompanyPattern {
  pattern_name: string;
  affected_companies: string[];
  affected_company_count: number;
  total_occurrences: number;
  severities: string[];
  first_seen: string | null;
  last_seen: string | null;
  recommendation: string | null;
}

export default function SuppressionPage() {
  const [rules, setRules] = useState<SuppressionRuleRow[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [patterns, setPatterns] = useState<CrossCompanyPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [patternInput, setPatternInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [createdBy, setCreatedBy] = useState('Support Engineer');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefillPattern, setPrefillPattern] = useState<string | null>(null);

  const loadRules = () => {
    fetch(`${API}/patterns/suppression-rules`)
      .then((r) => r.json())
      .then((d) => setRules(d.rules || []))
      .catch(() => setRules([]));
  };
  const loadCompanies = () => {
    fetch(`${API}/companies`)
      .then((r) => r.json())
      .then((d) => setCompanies(Array.isArray(d) ? d : []))
      .catch(() => setCompanies([]));
  };
  const loadPatterns = () => {
    fetch(`${API}/patterns/cross-company`)
      .then((r) => r.json())
      .then((d) => setPatterns(d.patterns || []))
      .catch(() => setPatterns([]));
  };

  useEffect(() => {
    loadRules();
    loadCompanies();
    loadPatterns();
    setLoading(false);
  }, []);

  useEffect(() => {
    if (prefillPattern !== null) {
      setPatternInput(prefillPattern);
      setPrefillPattern(null);
    }
  }, [prefillPattern]);

  const handleAddRule = () => {
    const pattern = patternInput.trim();
    if (!pattern) {
      setError('Pattern is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    fetch(`${API}/patterns/suppression-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: companyId || undefined,
        pattern,
        reason: reasonInput.trim() || undefined,
        created_by: createdBy || 'Support Engineer',
      }),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((d) => { throw new Error(d.detail || 'Failed'); });
        return r.json();
      })
      .then(() => {
        setPatternInput('');
        setReasonInput('');
        loadRules();
        setSubmitting(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to add rule');
        setSubmitting(false);
      });
  };

  const toggleActive = (ruleId: string, current: boolean) => {
    fetch(`${API}/patterns/suppression-rules/${ruleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !current }),
    })
      .then((r) => { if (r.ok) loadRules(); })
      .catch(() => {});
  };

  const deleteRule = (ruleId: string) => {
    if (!confirm('Delete this suppression rule?')) return;
    fetch(`${API}/patterns/suppression-rules/${ruleId}`, { method: 'DELETE' })
      .then((r) => { if (r.ok) loadRules(); })
      .catch(() => {});
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>Suppression Rules</h1>
        <p style={{ color: '#64748b', margin: 0, fontSize: '13px' }}>
          Hide findings matching a pattern for specific companies. Use cross-company patterns below to add rules from common issues.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px', alignItems: 'start' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b', marginBottom: '12px' }}>Rules</h2>
          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>Loading...</div>
          ) : rules.length === 0 ? (
            <div style={{ padding: '24px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#94a3b8', fontSize: '13px', textAlign: 'center' }}>
              No suppression rules yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {rules.map((r) => (
                <div
                  key={r.id}
                  style={{
                    background: r.is_active ? '#fff' : '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px',
                    opacity: r.is_active ? 1 : 0.85,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>{r.pattern}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      {r.company_name || 'All companies'} · by {r.created_by}
                      {r.created_at && ` · ${new Date(r.created_at).toLocaleDateString()}`}
                    </div>
                    {r.reason && <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>{r.reason}</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={r.is_active} onChange={() => toggleActive(r.id, r.is_active)} />
                      Active
                    </label>
                    <button
                      onClick={() => deleteRule(r.id)}
                      style={{ padding: '4px 10px', fontSize: '12px', color: '#b91c1c', background: '#fff', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', position: 'sticky', top: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b', marginBottom: '14px' }}>New rule</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Company</label>
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', background: '#fff', color: '#1e293b', boxSizing: 'border-box' }}
              >
                <option value="">— All companies —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Pattern</label>
              <input
                type="text"
                value={patternInput}
                onChange={(e) => setPatternInput(e.target.value)}
                placeholder="e.g. ingress not configured"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', color: '#1e293b', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Reason</label>
              <textarea
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                placeholder="Why suppress this? e.g. This company intentionally runs without ingress"
                rows={3}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', color: '#1e293b', boxSizing: 'border-box', resize: 'vertical' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Created by</label>
              <input
                type="text"
                value={createdBy}
                onChange={(e) => setCreatedBy(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', color: '#1e293b', boxSizing: 'border-box' }}
              />
            </div>
            {error && <div style={{ fontSize: '12px', color: '#b91c1c' }}>{error}</div>}
            <button
              onClick={handleAddRule}
              disabled={submitting || !patternInput.trim()}
              style={{
                width: '100%',
                padding: '10px 16px',
                background: '#1e3a5f',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Adding...' : 'Add Rule'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '32px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b', marginBottom: '12px' }}>Cross-Company Patterns</h2>
        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>Findings seen at 2+ companies. Add a suppression rule from a pattern below.</p>
        {patterns.length === 0 ? (
          <div style={{ padding: '24px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#94a3b8', fontSize: '13px', textAlign: 'center' }}>
            No cross-company patterns yet. Analyze bundles from multiple companies to see patterns.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {patterns.map((p, i) => (
              <div
                key={i}
                style={{
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '14px 18px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '14px' }}>{p.pattern_name}</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: '12px' }}>
                    Seen at {p.affected_company_count} companies
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                  {p.affected_companies.slice(0, 8).map((c) => (
                    <span key={c} style={{ fontSize: '11px', background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '12px' }}>{c}</span>
                  ))}
                  {p.affected_companies.length > 8 && <span style={{ fontSize: '11px', color: '#94a3b8' }}>+{p.affected_companies.length - 8} more</span>}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                  First seen: {p.first_seen ? new Date(p.first_seen).toLocaleDateString() : '—'} · Last seen: {p.last_seen ? new Date(p.last_seen).toLocaleDateString() : '—'}
                </div>
                {p.recommendation && <div style={{ fontSize: '12px', color: '#475569', marginBottom: '10px' }}>Top recommendation: {p.recommendation}</div>}
                <button
                  onClick={() => setPrefillPattern(p.pattern_name)}
                  style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 600, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Add Suppression Rule
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
