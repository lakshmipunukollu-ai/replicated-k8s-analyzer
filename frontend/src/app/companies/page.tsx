'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';
const API_COMPANIES = `${API}/companies`;

interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  tier: string;
  project_count: number;
  bundle_count: number;
  avg_health_score: number | null;
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTier, setNewTier] = useState('starter');
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const load = () => {
    fetch(API_COMPANIES)
      .then((r) => r.json())
      .then((data) => {
        setCompanies(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(API_COMPANIES, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), tier: newTier }),
      });
      if (!res.ok) throw new Error('Failed to create');
      setModalOpen(false);
      setNewName('');
      setNewTier('starter');
      load();
    } catch {
      setSubmitting(false);
    }
    setSubmitting(false);
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

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading companies...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b', margin: 0 }}>Companies</h1>
        <button
          onClick={() => setModalOpen(true)}
          style={{
            padding: '8px 16px',
            background: '#1e3a5f',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          New Company
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {companies.map((c) => (
          <div
            key={c.id}
            onClick={() => router.push(`/companies/${c.id}`)}
            style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '16px 20px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              transition: 'border-color .15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#93c5fd')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#e2e8f0')}
          >
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <span style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>{c.name}</span>
                {tierBadge(c.tier)}
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                {c.project_count} project{c.project_count !== 1 ? 's' : ''} · {c.bundle_count} bundle{c.bundle_count !== 1 ? 's' : ''}
                {c.avg_health_score != null && ` · Avg health ${c.avg_health_score}/100`}
              </div>
            </div>
            <span style={{ color: '#94a3b8', fontSize: '14px' }}>→</span>
          </div>
        ))}
      </div>

      {companies.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>
          No companies yet. Create one to get started.
        </div>
      )}

      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => !submitting && setModalOpen(false)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '12px',
              padding: '24px',
              width: '360px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '16px' }}>New Company</h2>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Acme Corp"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '14px',
                marginBottom: '14px',
                boxSizing: 'border-box',
              }}
            />
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Tier</label>
            <select
              value={newTier}
              onChange={(e) => setNewTier(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '14px',
                marginBottom: '20px',
                background: '#fff',
                color: '#1e293b',
              }}
            >
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="enterprise">Enterprise</option>
            </select>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModalOpen(false)} style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 500 }}>
                Cancel
              </button>
              <button onClick={handleCreate} disabled={submitting || !newName.trim()} style={{ padding: '8px 16px', background: submitting ? '#94a3b8' : '#1e3a5f', color: '#fff', border: 'none', borderRadius: '8px', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                {submitting ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
