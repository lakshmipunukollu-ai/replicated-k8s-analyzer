'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import HealthTrendChart from '@/components/HealthTrendChart';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';

interface ProjectRow {
  id: string;
  name: string;
  app_version: string | null;
  bundle_count: number;
  last_bundle_date: string | null;
}

interface HealthHistoryEntry {
  date: string;
  health_score: number;
  bundle_id: string;
  bundle_name: string;
}

interface VersionCorrelation {
  version: string;
  bundle_count: number;
  avg_health_score: number;
  finding_counts: { critical?: number; high?: number; medium?: number; low?: number };
  top_findings: string[];
  companies: string[];
}

interface CompanyDetail {
  id: string;
  name: string;
  slug: string;
  tier: string;
  projects: ProjectRow[];
  health_history?: HealthHistoryEntry[];
}

export default function CompanyDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectModal, setProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newAppVersion, setNewAppVersion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);
  const [projectBundles, setProjectBundles] = useState<{ id: string; filename: string; status: string; upload_time: string; finding_count: number }[]>([]);
  const [bundlesLoading, setBundlesLoading] = useState(false);
  const [versionCorrelations, setVersionCorrelations] = useState<VersionCorrelation[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (!id) return;
    fetch(`${API}/companies/${id}`)
      .then((r) => r.json())
      .then(setCompany)
      .catch(() => setCompany(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetch(`${API}/patterns/app-version-correlation`)
      .then((r) => r.json())
      .then((data) => setVersionCorrelations(data.correlations || []))
      .catch(() => setVersionCorrelations([]));
  }, []);

  useEffect(() => {
    if (!selectedProjectId) {
      setProjectBundles([]);
      setBundlesLoading(false);
      return;
    }
    setBundlesLoading(true);
    fetch(`${API}/projects/${selectedProjectId}/bundles`)
      .then((r) => r.json())
      .then((data) => { setProjectBundles(Array.isArray(data) ? data : []); setBundlesLoading(false); })
      .catch(() => { setProjectBundles([]); setBundlesLoading(false); });
  }, [selectedProjectId]);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/companies/${id}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName.trim(), app_version: newAppVersion.trim() || undefined }),
      });
      if (!res.ok) throw new Error('Failed');
      setProjectModal(false);
      setNewProjectName('');
      setNewAppVersion('');
      const data = await res.json();
      setCompany((prev) =>
        prev
          ? {
              ...prev,
              projects: [...prev.projects, { id: data.id, name: data.name, app_version: data.app_version, bundle_count: 0, last_bundle_date: null }],
            }
          : null
      );
    } finally {
      setSubmitting(false);
    }
  };

  const tierBadge = (tier: string) => {
    const colors: Record<string, { bg: string; color: string }> = {
      starter: { bg: '#f1f5f9', color: '#475569' },
      growth: { bg: '#dbeafe', color: '#1d4ed8' },
      enterprise: { bg: '#ede9fe', color: '#6d28d9' },
    };
    const s = colors[tier] || colors.starter;
    return (
      <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '12px', background: s.bg, color: s.color, textTransform: 'capitalize' }}>
        {tier}
      </span>
    );
  };

  if (loading || !company) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
        {loading ? 'Loading...' : 'Company not found'}
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b', margin: 0 }}>{company.name}</h1>
          {tierBadge(company.tier)}
        </div>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>{company.slug}</p>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <HealthTrendChart healthHistory={company.health_history} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b', margin: 0 }}>Projects</h2>
        <button
          onClick={() => setProjectModal(true)}
          style={{ padding: '6px 14px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
        >
          New Project
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
        {company.projects.map((p) => {
          const isSelected = selectedProjectId === p.id;
          const isHovered = hoveredProjectId === p.id;
          return (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedProjectId(isSelected ? null : p.id)}
              onMouseEnter={() => setHoveredProjectId(p.id)}
              onMouseLeave={() => setHoveredProjectId(null)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedProjectId(isSelected ? null : p.id); } }}
              style={{
                background: isSelected ? '#f0f9ff' : isHovered ? '#f9fafb' : '#fff',
                border: `1px solid ${isSelected ? '#93c5fd' : '#e2e8f0'}`,
                borderRadius: '8px',
                padding: '12px 16px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'background 0.15s ease, border-color 0.15s ease',
              }}
            >
              <div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{p.name}</span>
                {p.app_version && <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '8px' }}>{p.app_version}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  {p.bundle_count} bundle{p.bundle_count !== 1 ? 's' : ''}
                  {p.last_bundle_date && ` · Last ${new Date(p.last_bundle_date).toLocaleDateString()}`}
                </span>
                <span style={{ fontSize: '12px', color: isSelected || isHovered ? '#1e40af' : '#94a3b8', fontWeight: 500 }}>
                  View bundles →
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b', marginBottom: '12px' }}>Version Health</h2>
        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>Health by app version for this company</p>
        {versionCorrelations.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}>No version data yet. Upload bundles with an app version to see correlations.</div>
        ) : (
          <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: '#475569' }}>App Version</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: '#475569' }}>Bundles</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: '#475569' }}>Avg Health</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: '#475569' }}>Top Issue</th>
                </tr>
              </thead>
              <tbody>
                {versionCorrelations
                  .filter((v) => company.projects.some((p) => p.app_version === v.version) || v.companies.includes(company.name))
                  .map((v) => (
                    <tr key={v.version} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 12px', color: '#1e293b', fontWeight: 500 }}>{v.version}</td>
                      <td style={{ padding: '10px 12px', color: '#64748b' }}>{v.bundle_count}</td>
                      <td style={{ padding: '10px 12px', color: v.avg_health_score >= 70 ? '#15803d' : v.avg_health_score >= 40 ? '#b45309' : '#b91c1c', fontWeight: 600 }}>{v.avg_health_score}</td>
                      <td style={{ padding: '10px 12px', color: '#64748b', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.top_findings?.[0] || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedProjectId && (
        <div style={{ marginTop: '16px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>Bundles in this project</h3>
          {bundlesLoading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}>Loading bundles...</div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
              {projectBundles.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No bundles in this project yet.</div>
              ) : (
                projectBundles.map((b) => (
                  <div
                    key={b.id}
                    onClick={() => router.push(`/bundles/${b.id}`)}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#1e293b' }}>{b.filename}</span>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>{b.finding_count} findings · {b.status}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {projectModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => !submitting && setProjectModal(false)}
        >
          <div
            style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '360px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>New Project</h2>
            <input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Project name"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '12px', boxSizing: 'border-box' }}
            />
            <input
              value={newAppVersion}
              onChange={(e) => setNewAppVersion(e.target.value)}
              placeholder="App version (e.g. v2.1.4)"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '20px', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setProjectModal(false)} style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleCreateProject} disabled={submitting || !newProjectName.trim()} style={{ padding: '8px 16px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                {submitting ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
