'use client';
import { useEffect, useState } from 'react';

interface Profile {
  k8s_version: string | null;
  node_count: number;
  cloud_provider: string;
  total_memory: string | null;
  container_runtime: string | null;
  findings_summary: string | null;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';

const PROVIDER_COLORS: Record<string, { bg: string; color: string }> = {
  'AWS EKS': { bg: '#fef3c7', color: '#92400e' },
  'Google GKE': { bg: '#dbeafe', color: '#1d4ed8' },
  'Azure AKS': { bg: '#ede9fe', color: '#6d28d9' },
  'Unknown': { bg: '#f1f5f9', color: '#475569' },
};

export default function ClusterProfile({ bundleId }: { bundleId: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/bundles/${bundleId}/cluster-profile`)
      .then(r => r.json())
      .then(d => { setProfile(d.profile); setLoading(false); })
      .catch(() => setLoading(false));
  }, [bundleId]);

  if (loading) return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px 18px' }}>
      <div style={{ fontSize: '12px', color: '#64748b' }}>Detecting cluster profile...</div>
    </div>
  );

  if (!profile) return null;

  const providerStyle = PROVIDER_COLORS[profile.cloud_provider] || PROVIDER_COLORS['Unknown'];
  const items = [
    { icon: '☸', label: 'K8s Version', value: profile.k8s_version || 'Unknown' },
    { icon: '⬡', label: 'Nodes', value: `${profile.node_count} node${profile.node_count !== 1 ? 's' : ''}` },
    { icon: '☁', label: 'Provider', value: profile.cloud_provider },
    { icon: '⚡', label: 'Runtime', value: profile.container_runtime || 'Unknown' },
  ];
  if (profile.total_memory) {
    items.push({ icon: '▦', label: 'Memory', value: profile.total_memory });
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px 18px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>Cluster Profile</div>
        <span style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: providerStyle.bg, color: providerStyle.color }}>
          {profile.cloud_provider}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
        {items.map(item => (
          <div key={item.label} style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: '6px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '14px' }}>{item.icon}</span>
            <div>
              <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 500, textTransform: 'uppercase' as const, letterSpacing: '0.4px' }}>{item.label}</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{item.value}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
