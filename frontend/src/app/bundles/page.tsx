'use client';

import { useState, useEffect } from 'react';
import BundleList from '@/components/BundleList';
import BundleComparison from '@/components/BundleComparison';
import FindingHeatmap from '@/components/FindingHeatmap';
import HealthTrendChart from '@/components/HealthTrendChart';
import SafeAlertSummaryBar from '@/components/SafeAlertSummaryBar';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';
const API_COMPANIES = `${API}/companies`;

interface Company { id: string; name: string; slug: string; tier: string; project_count: number; bundle_count: number; avg_health_score: number | null; }
interface Project { id: string; name: string; app_version: string | null; bundle_count: number; last_bundle_date: string | null; }

export default function BundlesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string>('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>('');

  useEffect(() => {
    fetch(API_COMPANIES).then((r) => r.json()).then((data) => setCompanies(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  useEffect(() => {
    setProjectId('');
    if (!companyId) {
      setProjects([]);
      return;
    }
    fetch(`${API}/companies/${companyId}`)
      .then((r) => r.json())
      .then((data) => setProjects(data?.projects || []))
      .catch(() => setProjects([]));
  }, [companyId]);

  return (
    <div>
      <SafeAlertSummaryBar />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Diagnostics Dashboard</h1>
      </div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Filter:</span>
        <select
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: '#fff', color: '#1e293b', minWidth: '160px' }}
        >
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          disabled={!companyId}
          style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: '#fff', color: '#1e293b', minWidth: '160px' }}
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      <HealthTrendChart />
      <FindingHeatmap />
      <BundleList companyId={companyId || undefined} projectId={projectId || undefined} />
      <div className="mt-8">
        <BundleComparison />
      </div>
    </div>
  );
}
