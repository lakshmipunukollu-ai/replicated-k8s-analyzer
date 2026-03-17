'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import BundleChat from '@/components/BundleChat';
import IncidentTimeline from '@/components/IncidentTimeline';
import RemediationPlaybook from '@/components/RemediationPlaybook';
import ClusterHealthGauge from '@/components/ClusterHealthGauge';
import CorrelationGraph from '@/components/CorrelationGraph';
import ExportReport from '@/components/ExportReport';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
const TABS = ['Overview', 'Findings', 'Timeline', 'Correlations', 'Playbook', 'Export', 'Ask AI'];

export default function BundleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [bundle, setBundle] = useState<any>(null);
  const [findings, setFindings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Overview');

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`${API}/bundles/${id}`).then(r => r.json()),
      fetch(`${API}/bundles/${id}/report`).then(r => r.json()),
    ]).then(([b, report]) => {
      setBundle(b);
      setFindings(report.findings || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' as const, color: '#64748b' }}>Loading bundle...</div>;
  if (!bundle) return <div style={{ padding: '40px', textAlign: 'center' as const, color: '#ef4444' }}>Bundle not found</div>;

  const severityColor: Record<string, string> = { critical: '#ef4444', high: '#f59e0b', medium: '#6366f1', low: '#10b981', info: '#94a3b8' };
  const severityBg: Record<string, string> = { critical: '#fee2e2', high: '#fef3c7', medium: '#f5f3ff', low: '#f0fdf4', info: '#f8fafc' };

  const formatEvidence = (ev: unknown): string => {
    if (ev == null) return '';
    if (Array.isArray(ev) && ev.length > 0) {
      const first = ev[0];
      if (typeof first === 'object' && first !== null && 'content' in first) return String((first as { content?: string }).content ?? '');
      if (typeof first === 'object' && first !== null && 'source' in first) return String((first as { source?: string }).source ?? '');
    }
    return typeof ev === 'string' ? ev : JSON.stringify(ev);
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <button onClick={() => router.push('/bundles')} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '8px' }}>← Back to Dashboard</button>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>{bundle.filename}</h1>
        <div style={{ fontSize: '13px', color: '#64748b' }}>Status: {bundle.status} · {findings.length} findings</div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', overflowX: 'auto' as const }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '8px 16px', border: 'none', background: 'none', fontSize: '13px',
            fontWeight: activeTab === tab ? 600 : 400,
            color: activeTab === tab ? '#1e3a5f' : '#64748b', cursor: 'pointer',
            borderBottom: activeTab === tab ? '2px solid #1e3a5f' : '2px solid transparent',
            marginBottom: '-1px', whiteSpace: 'nowrap' as const,
          }}>{tab}</button>
        ))}
      </div>

      {/* Overview tab */}
      {activeTab === 'Overview' && (
        <div>
          <ClusterHealthGauge bundleId={id} />
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px 18px', marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '10px' }}>By severity</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
              {['critical', 'high', 'medium', 'low', 'info'].map(sev => {
                const count = findings.filter(f => f.severity === sev).length;
                if (!count) return null;
                return <span key={sev} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: severityBg[sev], color: severityColor[sev], padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>{sev.toUpperCase()} {count}</span>;
              })}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <button onClick={() => setActiveTab('Playbook')} style={{ padding: '14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', textAlign: 'left' as const }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>→ View Remediation Playbook</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Step-by-step kubectl commands</div>
            </button>
            <button onClick={() => setActiveTab('Ask AI')} style={{ padding: '14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', textAlign: 'left' as const }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>→ Ask AI about this bundle</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Grounded in actual bundle data</div>
            </button>
          </div>
        </div>
      )}

      {activeTab === 'Findings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {findings.map((f: any, i: number) => (
            <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ background: severityBg[f.severity], color: severityColor[f.severity], fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', textTransform: 'uppercase' as const }}>{f.severity}</span>
                {f.category && <span style={{ background: '#f1f5f9', color: '#475569', fontSize: '11px', padding: '2px 7px', borderRadius: '4px' }}>{f.category}</span>}
                <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#94a3b8' }}>{Math.round((f.confidence || 0) * 100)}% confidence</span>
              </div>
              <div style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>{f.title}</div>
                <div style={{ fontSize: '13px', color: '#475569', marginBottom: '10px' }}>{f.summary}</div>
                {f.root_cause && <div style={{ marginBottom: '8px' }}><div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '3px' }}>Root cause</div><div style={{ fontSize: '13px', color: '#374151' }}>{f.root_cause}</div></div>}
                {f.impact && <div style={{ marginBottom: '8px' }}><div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '3px' }}>Impact</div><div style={{ fontSize: '13px', color: '#374151' }}>{f.impact}</div></div>}
                {f.recommended_actions?.length > 0 && <div style={{ marginBottom: '8px' }}><div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '4px' }}>Recommended actions</div>{f.recommended_actions.map((a: string, j: number) => <div key={j} style={{ fontSize: '13px', color: '#374151', display: 'flex', gap: '6px' }}><span>·</span>{a}</div>)}</div>}
                {(f.evidence != null && (Array.isArray(f.evidence) ? f.evidence.length > 0 : true)) && <div style={{ fontFamily: 'monospace', fontSize: '11px', background: '#f8fafc', border: '0.5px solid #e2e8f0', padding: '7px 10px', borderRadius: '5px', color: '#64748b' }}>{formatEvidence(f.evidence)}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'Timeline' && <IncidentTimeline bundleId={id} />}
      {activeTab === 'Correlations' && <CorrelationGraph bundleId={id} />}
      {activeTab === 'Playbook' && <RemediationPlaybook bundleId={id} />}
      {activeTab === 'Export' && <ExportReport bundleId={id} filename={bundle.filename} />}
      {activeTab === 'Ask AI' && <BundleChat bundleId={id} />}
    </div>
  );
}
