'use client';

import { useEffect, useState } from 'react';
import { getAuthHeaders } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';

interface Company {
  id: string;
  name: string;
  slug: string;
}

interface Rule {
  id: string;
  name: string;
  description: string | null;
  company_id: string | null;
  company_name: string | null;
  trigger_severity: string | null;
  trigger_pattern: string | null;
  trigger_count: number;
  trigger_window_hours: number;
  channel: string;
  destination: string | null;
  is_active: boolean;
  last_triggered_at: string | null;
  firing_count: number;
  created_at: string | null;
}

interface Firing {
  id: string;
  rule_id: string;
  rule_name: string;
  bundle_id: string | null;
  bundle_filename: string | null;
  company_id: string | null;
  triggered_at: string | null;
}

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export default function AlertsPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [firings, setFirings] = useState<Firing[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'ok' | 'err' } | null>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    company_id: '',
    trigger_severity: 'any',
    trigger_pattern: '',
    trigger_count: 1,
    trigger_window_hours: 24,
    channel: 'slack',
    destination: '',
  });

  const load = () => {
    const headers = getAuthHeaders();
    Promise.all([
      fetch(`${API}/alerts/rules`, { headers }).then((r) => r.json()).catch(() => []),
      fetch(`${API}/alerts/firings`, { headers }).then((r) => r.json()).catch(() => []),
      fetch(`${API}/companies`, { headers }).then((r) => r.json()).then((d) => d.companies || d || []).catch(() => []),
    ]).then(([rulesData, firingsData, companiesData]) => {
      setRules(Array.isArray(rulesData) ? rulesData : []);
      setFirings(Array.isArray(firingsData) ? firingsData : []);
      setCompanies(Array.isArray(companiesData) ? companiesData : []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const showToast = (message: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleCreateRule = () => {
    if (!form.name.trim()) return;
    fetch(`${API}/alerts/rules`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        company_id: form.company_id || null,
        trigger_severity: form.trigger_severity === 'any' ? null : form.trigger_severity,
        trigger_pattern: form.trigger_pattern.trim() || null,
        trigger_count: form.trigger_count,
        trigger_window_hours: form.trigger_window_hours,
        channel: form.channel,
        destination: form.destination.trim() || undefined,
      }),
    })
      .then((r) => r.json())
      .then(() => {
        showToast('Rule created');
        setForm({ ...form, name: '', description: '', trigger_pattern: '', destination: '' });
        load();
      })
      .catch(() => showToast('Failed to create rule', 'err'));
  };

  const handleToggleActive = (rule: Rule) => {
    fetch(`${API}/alerts/rules/${rule.id}`, {
      method: 'PATCH',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !rule.is_active }),
    })
      .then(() => load())
      .catch(() => showToast('Failed to update', 'err'));
  };

  const handleTest = (ruleId: string) => {
    fetch(`${API}/alerts/rules/${ruleId}/test`, { method: 'POST', headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((d) => showToast(d.message || (d.would_fire ? 'Would fire' : 'Would not fire')))
      .catch(() => showToast('Test failed', 'err'));
  };

  const handleDelete = (ruleId: string) => {
    if (!confirm('Delete this rule?')) return;
    fetch(`${API}/alerts/rules/${ruleId}`, { method: 'DELETE', headers: getAuthHeaders() })
      .then(() => { load(); showToast('Rule deleted'); })
      .catch(() => showToast('Delete failed', 'err'));
  };

  const windowOptions = [
    { value: 24, label: '24h' },
    { value: 48, label: '48h' },
    { value: 168, label: '7 days' },
  ];

  if (loading) {
    return (
      <div className="py-8 text-gray-500">Loading alerts...</div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-2">Alert Rules</h1>
      <p className="text-sm text-gray-500 mb-6">Configure rules to fire when bundles match severity or pattern.</p>

      {toast && (
        <div
          className="fixed top-4 right-4 z-50 px-4 py-2 rounded shadow text-sm text-white"
          style={{ background: toast.type === 'err' ? '#dc2626' : '#059669' }}
        >
          {toast.message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-4">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900">{rule.name}</div>
                  {rule.description && (
                    <div className="text-xs text-gray-500 mt-0.5">{rule.description}</div>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {rule.company_name && (
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                        Company: {rule.company_name}
                      </span>
                    )}
                    {rule.trigger_severity && (
                      <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                        Severity: {rule.trigger_severity}
                      </span>
                    )}
                    {rule.trigger_pattern && (
                      <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-800">
                        Pattern: {rule.trigger_pattern}
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                      Window: {rule.trigger_window_hours}h
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-gray-500">
                      Fired {rule.firing_count}x
                      {rule.last_triggered_at && ` · Last: ${relativeTime(rule.last_triggered_at)}`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(rule)}
                    className={`relative w-10 h-5 rounded-full transition ${rule.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition left-0.5 ${rule.is_active ? 'translate-x-5' : 'translate-x-0'}`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTest(rule.id)}
                    className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Test
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(rule.id)}
                    className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
          {rules.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500 text-sm">
              No alert rules yet. Create one in the form →
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-3">New Rule</h2>
            <div className="space-y-3">
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Rule name"
                className="w-full text-sm border border-gray-200 rounded px-3 py-2"
              />
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Description (optional)"
                rows={2}
                className="w-full text-sm border border-gray-200 rounded px-3 py-2 resize-y"
              />
              <div>
                <label className="block text-xs text-gray-500 mb-1">Company</label>
                <select
                  value={form.company_id}
                  onChange={(e) => setForm({ ...form, company_id: e.target.value })}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2"
                >
                  <option value="">All Companies</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Trigger Severity</label>
                <select
                  value={form.trigger_severity}
                  onChange={(e) => setForm({ ...form, trigger_severity: e.target.value })}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2"
                >
                  <option value="any">Any</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Trigger Pattern (keyword)</label>
                <input
                  type="text"
                  value={form.trigger_pattern}
                  onChange={(e) => setForm({ ...form, trigger_pattern: e.target.value })}
                  placeholder="e.g. OOMKill, CrashLoop"
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Fire when [N] or more companies hit this pattern
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.trigger_count}
                  onChange={(e) => setForm({ ...form, trigger_count: parseInt(e.target.value, 10) || 1 })}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Time Window</label>
                <select
                  value={form.trigger_window_hours}
                  onChange={(e) => setForm({ ...form, trigger_window_hours: parseInt(e.target.value, 10) })}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2"
                >
                  {windowOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Channel</label>
                <select
                  value={form.channel}
                  onChange={(e) => setForm({ ...form, channel: e.target.value })}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2"
                >
                  <option value="slack">Slack</option>
                  <option value="email">Email</option>
                  <option value="webhook">Webhook</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  {form.channel === 'webhook' ? 'Webhook URL' : form.channel === 'email' ? 'Email' : 'Destination'}
                </label>
                <input
                  type="text"
                  value={form.destination}
                  onChange={(e) => setForm({ ...form, destination: e.target.value })}
                  placeholder={form.channel === 'webhook' ? 'https://...' : form.channel === 'email' ? 'email@example.com' : ''}
                  className="w-full text-sm border border-gray-200 rounded px-3 py-2"
                />
              </div>
              <button
                type="button"
                onClick={handleCreateRule}
                className="w-full py-2 rounded font-medium text-white bg-gray-800 hover:bg-gray-700"
              >
                Create Rule
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-3">Recent Firings</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {firings.slice(0, 10).map((f) => (
                <div key={f.id} className="text-sm border-b border-gray-100 pb-2 last:border-0">
                  <div className="font-medium text-gray-800">{f.rule_name}</div>
                  <div className="text-xs text-gray-500">
                    {f.bundle_filename || f.bundle_id || '—'} · {relativeTime(f.triggered_at)}
                  </div>
                </div>
              ))}
              {firings.length === 0 && (
                <p className="text-sm text-gray-500">No alerts have fired yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
