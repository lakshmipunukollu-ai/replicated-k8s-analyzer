'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import BundleChat from '@/components/BundleChat';
import IncidentTimeline from '@/components/IncidentTimeline';
import RemediationPlaybook from '@/components/RemediationPlaybook';
import ClusterHealthGauge from '@/components/ClusterHealthGauge';
import CorrelationGraph from '@/components/CorrelationGraph';
import ExportReport from '@/components/ExportReport';
import SimilarIncidents from '@/components/SimilarIncidents';
import AnalysisVersionHistory from '@/components/AnalysisVersionHistory';
import ClusterProfile from '@/components/ClusterProfile';
import ConfidenceExplainer from '@/components/ConfidenceExplainer';
import FindingCard from '@/components/FindingCard';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';
const TABS = ['Overview', 'Findings', 'Timeline', 'Correlations', 'Playbook', 'Export', 'Ask AI', 'History'];

export default function BundleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [bundle, setBundle] = useState<any>(null);
  const [findings, setFindings] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [correlations, setCorrelations] = useState<any>({ nodes: [], edges: [] });
  const [playbook, setPlaybook] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [priorityAction, setPriorityAction] = useState<any>(null);
  const [fixScript, setFixScript] = useState<string | null>(null);
  const [scriptCopied, setScriptCopied] = useState(false);
  const [severityFilter, setSeverityFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('Overview');

  useEffect(() => {
    if (!id) return;

    Promise.all([
      fetch(`${API}/bundles/${id}`).then(r => r.json()),
      fetch(`${API}/bundles/${id}/report`).then(r => r.json()),
      fetch(`${API}/bundles/${id}/timeline`).then(r => r.json()).catch(() => ({ events: [] })),
      fetch(`${API}/bundles/${id}/correlations`).then(r => r.json()).catch(() => ({ nodes: [], edges: [] })),
      fetch(`${API}/bundles/${id}/playbook`).then(r => r.json()).catch(() => ({ playbook: [] })),
    ]).then(([b, report, tl, corr, pb]) => {
      if (!b || b.detail === 'Bundle not found') {
        setLoading(false);
        return;
      }
      setBundle(b);
      setFindings(report.findings || []);
      setTimeline(tl?.events || []);
      setCorrelations({ nodes: corr?.nodes || [], edges: corr?.edges || [] });
      setPlaybook(pb?.playbook || []);
      setLoading(false);

      fetch(`${API}/bundles/${id}/summary`)
        .then(r => r.json())
        .then(sum => setSummary(sum))
        .catch(() => {});

      fetch(`${API}/bundles/${id}/priority-action`)
        .then(r => r.json())
        .then(d => setPriorityAction(d))
        .catch(() => {});
    }).catch(() => setLoading(false));
  }, [id]);

  // Poll every 3 seconds while analyzing
  useEffect(() => {
    if (!bundle || bundle.status !== 'analyzing') return;
    const interval = setInterval(async () => {
      try {
        const [b, report] = await Promise.all([
          fetch(`${API}/bundles/${id}`).then(r => r.json()),
          fetch(`${API}/bundles/${id}/report`).then(r => r.json()),
        ]);
        if (b.status === 'completed' && (report.findings || []).length > 0) {
          setBundle(b);
          setFindings(report.findings || []);
          clearInterval(interval);
          Promise.all([
            fetch(`${API}/bundles/${id}/timeline`).then(r => r.json()).catch(() => ({ events: [] })),
            fetch(`${API}/bundles/${id}/correlations`).then(r => r.json()).catch(() => ({ nodes: [], edges: [] })),
            fetch(`${API}/bundles/${id}/playbook`).then(r => r.json()).catch(() => ({ playbook: [] })),
          ]).then(([tl, corr, pb]) => {
            setTimeline(tl?.events || []);
            setCorrelations({ nodes: corr?.nodes || [], edges: corr?.edges || [] });
            setPlaybook(pb?.playbook || []);
          });
        }
      } catch { }
    }, 3000);
    return () => clearInterval(interval);
  }, [bundle?.status, id]);

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

      {findings.length === 0 && !loading && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#92400e' }}>
          ⟳ Analyzing bundle — findings will appear in ~15 seconds. Page will reload automatically.
        </div>
      )}

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
          <ClusterProfile bundleId={id} />
          <ClusterHealthGauge bundleId={id} data={summary} />
          {priorityAction?.action && (
            <div
              onClick={() => setActiveTab('Playbook')}
              style={{ background: '#1e3a5f', borderRadius: '8px', padding: '16px 20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer', transition: 'opacity .15s' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              title="Click to view remediation playbook"
            >
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>→</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#93c5fd', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '4px' }}>Start Here → Playbook</div>
                <div style={{ fontSize: '14px', color: '#f1f5f9', fontWeight: 500 }}>{priorityAction.action}</div>
              </div>
              <div style={{ fontSize: '12px', color: '#93c5fd', flexShrink: 0 }}>View playbook →</div>
            </div>
          )}
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
          <div style={{ marginTop: '16px' }}>
            <SimilarIncidents bundleId={id} />
          </div>
        </div>
      )}

      {activeTab === 'Findings' && (
        <div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            {['all', 'critical', 'high', 'medium', 'low'].map(sev => {
              const count = sev === 'all' ? findings.length : findings.filter(f => f.severity === sev).length;
              if (count === 0 && sev !== 'all') return null;
              return (
                <button key={sev} onClick={() => setSeverityFilter(sev)} style={{
                  padding: '5px 14px', borderRadius: '20px', border: '1px solid',
                  borderColor: severityFilter === sev ? '#1e3a5f' : '#e2e8f0',
                  background: severityFilter === sev ? '#1e3a5f' : '#fff',
                  color: severityFilter === sev ? '#fff' : '#475569',
                  fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                }}>
                  {sev === 'all' ? 'All' : sev.charAt(0).toUpperCase() + sev.slice(1)} ({count})
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>
            {findings.filter(f => severityFilter === 'all' || f.severity === severityFilter).map((f: any, i: number) => (
              <div key={f.id || i}>
                <FindingCard finding={{ ...f, bundle_id: f.bundle_id || id }} expanded bundleId={id} />
                <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'flex-end' }}>
                  <ConfidenceExplainer bundleId={id} findingId={f.id} confidence={Math.round((f.confidence || 0) * 100)} />
                </div>
              </div>
          ))}
          </div>
        </div>
      )}

      {activeTab === 'Timeline' && <IncidentTimeline bundleId={id} events={timeline} />}
      {activeTab === 'Correlations' && (
        <CorrelationGraph
          bundleId={id}
          nodes={correlations.nodes}
          edges={correlations.edges}
          findings={findings}
          onNavigateToFindings={() => setActiveTab('Findings')}
        />
      )}
      {activeTab === 'Playbook' && (
        <div>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px 18px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>Generate Complete Fix Script</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>One bash script combining all remediation steps in order</div>
            </div>
            <button
              onClick={async () => {
                const res = await fetch(`${API}/bundles/${id}/fix-script`);
                const data = await res.json();
                setFixScript(data.script);
              }}
              style={{ padding: '8px 18px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const }}
            >
              Generate Fix Script
            </button>
          </div>
          {fixScript && (
            <div style={{ background: '#0f172a', borderRadius: '8px', padding: '16px', marginBottom: '16px', position: 'relative' as const }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8' }}>remediate.sh</span>
                <button
                  onClick={() => { navigator.clipboard.writeText(fixScript); setScriptCopied(true); setTimeout(() => setScriptCopied(false), 2000); }}
                  style={{ padding: '4px 12px', background: scriptCopied ? '#10b981' : '#1e293b', color: '#fff', border: '1px solid #334155', borderRadius: '5px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {scriptCopied ? '✓ Copied!' : 'Copy Script'}
                </button>
              </div>
              <pre style={{ fontFamily: 'monospace', fontSize: '12px', color: '#e2e8f0', margin: 0, whiteSpace: 'pre-wrap' as const, maxHeight: '300px', overflowY: 'auto' as const }}>
                {fixScript}
              </pre>
            </div>
          )}
          <RemediationPlaybook bundleId={id} playbook={playbook} />
        </div>
      )}
      {activeTab === 'Export' && <ExportReport bundleId={id} filename={bundle.filename} />}
      {activeTab === 'Ask AI' && <BundleChat bundleId={id} />}
      {activeTab === 'History' && (
        <AnalysisVersionHistory
          bundleId={id}
          onReanalyze={() => {
            setLoading(true);
            setTimeout(() => window.location.reload(), 22000);
          }}
        />
      )}
    </div>
  );
}
