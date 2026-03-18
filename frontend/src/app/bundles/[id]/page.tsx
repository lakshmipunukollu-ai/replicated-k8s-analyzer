'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import type { SummaryData } from '@/components/ClusterHealthGauge';
import type { Finding } from '@/lib/api';
import type { TimelineEvent } from '@/components/IncidentTimeline';
import type { CorrelationNode, CorrelationEdge } from '@/components/CorrelationGraph';
import type { Playbook } from '@/components/RemediationPlaybook';
import { getAuthHeaders } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';
const TABS = ['Overview', 'Findings', 'Timeline', 'Correlations', 'Playbook', 'Export', 'Ask AI', 'History'];

type LoadKey =
  | 'summary'
  | 'findings'
  | 'profile'
  | 'priority'
  | 'similar'
  | 'timeline'
  | 'correlations'
  | 'playbook'
  | 'aiName';

const INITIAL_LOADED: Record<LoadKey, boolean> = {
  summary: false,
  findings: false,
  profile: false,
  priority: false,
  similar: false,
  timeline: false,
  correlations: false,
  playbook: false,
  aiName: false,
};

interface BundleMeta {
  filename?: string;
  status?: string;
  detail?: string;
}

interface ClusterProfileData {
  k8s_version: string | null;
  node_count: number;
  cloud_provider: string;
  total_memory: string | null;
  container_runtime: string | null;
  findings_summary: string | null;
}

interface SimilarIncident {
  bundle_id: string;
  ai_name: string;
  filename: string;
  match_score: number;
  finding_count: number;
  health_score: number;
  upload_time: string;
  shared_findings: string[];
}

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  try {
    if (!res.ok) return {};
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

interface PriorityActionType {
  action?: string;
}

function allDetailLoaded(loaded: Record<LoadKey, boolean>) {
  return (Object.keys(INITIAL_LOADED) as LoadKey[]).every(k => loaded[k]);
}

export default function BundleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [bundle, setBundle] = useState<BundleMeta | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [correlations, setCorrelations] = useState<{ nodes: CorrelationNode[]; edges: CorrelationEdge[] }>({ nodes: [], edges: [] });
  const [playbook, setPlaybook] = useState<Playbook[]>([]);
  const [bundleLoading, setBundleLoading] = useState(true);
  const [loaded, setLoaded] = useState<Record<LoadKey, boolean>>({ ...INITIAL_LOADED });
  const [priorityAction, setPriorityAction] = useState<PriorityActionType | null>(null);
  const [fixScript, setFixScript] = useState<string | null>(null);
  const [scriptCopied, setScriptCopied] = useState(false);
  const [severityFilter, setSeverityFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('Overview');
  const [aiName, setAiName] = useState<string | null>(null);
  const [clusterProfile, setClusterProfile] = useState<ClusterProfileData | null>(null);
  const [similarList, setSimilarList] = useState<SimilarIncident[]>([]);

  const markLoaded = useCallback((key: LoadKey) => {
    setLoaded(prev => ({ ...prev, [key]: true }));
  }, []);

  const runParallelLoads = useCallback(
    (bundleId: string, headers: HeadersInit, cancelled: () => boolean) => {
      setLoaded({ ...INITIAL_LOADED });

      const fire = async (key: LoadKey, work: () => Promise<void>) => {
        try {
          await work();
        } finally {
          if (!cancelled()) markLoaded(key);
        }
      };

      void fire('summary', async () => {
        const sum = await fetch(`${API}/bundles/${bundleId}/summary`, { headers }).then(safeJson);
        if (cancelled()) return;
        const s = sum as { summary?: string; health_score?: number; bundle_id?: string };
        setSummary(s?.bundle_id != null || s?.summary != null ? (s as unknown as SummaryData) : null);
      });

      void fire('aiName', async () => {
        const ai = await fetch(`${API}/bundles/${bundleId}/ai-name`, { headers }).then(safeJson);
        if (cancelled()) return;
        setAiName(typeof ai?.ai_name === 'string' ? ai.ai_name : null);
      });

      void fire('priority', async () => {
        const pri = await fetch(`${API}/bundles/${bundleId}/priority-action`, { headers }).then(safeJson);
        if (cancelled()) return;
        setPriorityAction((pri as PriorityActionType) || null);
      });

      void fire('profile', async () => {
        const prof = await fetch(`${API}/bundles/${bundleId}/cluster-profile`, { headers }).then(safeJson);
        if (cancelled()) return;
        const p = prof as { profile?: ClusterProfileData | null };
        setClusterProfile(p?.profile ?? null);
      });

      void fire('similar', async () => {
        const sim = await fetch(`${API}/bundles/${bundleId}/similar`, { headers }).then(safeJson);
        if (cancelled()) return;
        const simList = sim as { similar?: SimilarIncident[] };
        setSimilarList(Array.isArray(simList?.similar) ? simList.similar : []);
      });

      void fire('findings', async () => {
        const rep = await fetch(`${API}/bundles/${bundleId}/report`, { headers }).then(safeJson);
        if (cancelled()) return;
        const report = rep as { findings?: Finding[] };
        setFindings((report?.findings || []) as Finding[]);
      });

      void fire('timeline', async () => {
        const tl = await fetch(`${API}/bundles/${bundleId}/timeline`, { headers }).then(safeJson).catch(() => ({}));
        if (cancelled()) return;
        const t = tl as { events?: TimelineEvent[] };
        setTimeline((t?.events || []) as TimelineEvent[]);
      });

      void fire('correlations', async () => {
        const corr = await fetch(`${API}/bundles/${bundleId}/correlations`, { headers }).then(safeJson).catch(() => ({}));
        if (cancelled()) return;
        const c = corr as { nodes?: CorrelationNode[]; edges?: CorrelationEdge[] };
        setCorrelations({
          nodes: (c?.nodes || []) as CorrelationNode[],
          edges: (c?.edges || []) as CorrelationEdge[],
        });
      });

      void fire('playbook', async () => {
        const pb = await fetch(`${API}/bundles/${bundleId}/playbook`, { headers }).then(safeJson).catch(() => ({}));
        if (cancelled()) return;
        const pl = pb as { playbook?: Playbook[] };
        setPlaybook((pl?.playbook || []) as Playbook[]);
      });
    },
    [markLoaded]
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const isCancelled = () => cancelled;
    const headers = getAuthHeaders();
    setBundleLoading(true);
    setBundle(null);
    setFindings([]);
    setSummary(null);
    setAiName(null);
    setPriorityAction(null);
    setClusterProfile(null);
    setSimilarList([]);
    setLoaded({ ...INITIAL_LOADED });

    (async () => {
      const bRes = await fetch(`${API}/bundles/${id}`, { headers });
      const b = (await bRes.json().catch(() => null)) as BundleMeta | null;
      if (cancelled) return;
      if (!b || b.detail === 'Bundle not found') {
        setBundle(null);
        setBundleLoading(false);
        setLoaded({
          summary: true,
          findings: true,
          profile: true,
          priority: true,
          similar: true,
          timeline: true,
          correlations: true,
          playbook: true,
          aiName: true,
        });
        return;
      }
      setBundle(b);
      setBundleLoading(false);
      runParallelLoads(id, headers, isCancelled);
    })().catch(() => {
      if (!cancelled) {
        setBundleLoading(false);
        setLoaded({
          summary: true,
          findings: true,
          profile: true,
          priority: true,
          similar: true,
          timeline: true,
          correlations: true,
          playbook: true,
          aiName: true,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [id, runParallelLoads]);

  useEffect(() => {
    if (!bundle || bundle.status !== 'analyzing') return;
    const interval = setInterval(async () => {
      try {
        const headers = getAuthHeaders();
        const bRes = await fetch(`${API}/bundles/${id}`, { headers });
        const nextBundle = (await bRes.json()) as BundleMeta;
        const report = await fetch(`${API}/bundles/${id}/report`, { headers }).then(safeJson);
        const fd = (report as { findings?: Finding[] }).findings || [];
        if (nextBundle.status === 'completed' && fd.length > 0) {
          setBundle(nextBundle);
          clearInterval(interval);
          runParallelLoads(id, headers, () => false);
        }
      } catch {
        /* ignore */
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [bundle?.status, id, runParallelLoads]);

  const gaugeData: SummaryData = useMemo(() => {
    const c = findings.filter(f => f.severity === 'critical').length;
    const h = findings.filter(f => f.severity === 'high').length;
    const m = findings.filter(f => f.severity === 'medium').length;
    const l = findings.filter(f => f.severity === 'low').length;
    const hs = Math.max(0, 100 - c * 15 - h * 7 - m * 3 - l * 1);
    return {
      summary: summary?.summary ?? '',
      health_score: hs,
      critical_count: c,
      high_count: h,
      total_findings: findings.length,
    };
  }, [findings, summary?.summary]);

  const showTopBar = bundleLoading || (bundle != null && !allDetailLoaded(loaded));
  const loadingFindings = !loaded.findings;
  const loadingSummary = !loaded.summary;
  const loadingProfile = !loaded.profile;
  const loadingPriority = !loaded.priority;
  const loadingSimilar = !loaded.similar;

  if (bundleLoading) {
    return (
      <>
        <div className="fixed top-0 left-0 right-0 z-[200] h-1 bg-slate-100 overflow-hidden">
          <div className="bundle-detail-top-bar-strip" />
        </div>
        <div className="max-w-[960px] mx-auto px-6 py-10 text-center text-gray-500">Loading bundle...</div>
      </>
    );
  }

  if (!bundle) {
    return <div className="max-w-[960px] mx-auto px-6 py-10 text-center text-red-600">Bundle not found</div>;
  }

  const severityColor: Record<string, string> = { critical: '#ef4444', high: '#f59e0b', medium: '#6366f1', low: '#10b981', info: '#94a3b8' };
  const severityBg: Record<string, string> = { critical: '#fee2e2', high: '#fef3c7', medium: '#f5f3ff', low: '#f0fdf4', info: '#f8fafc' };

  return (
    <>
      {showTopBar && (
        <div className="fixed top-0 left-0 right-0 z-[200] h-1 bg-slate-100 overflow-hidden">
          <div className="bundle-detail-top-bar-strip" />
        </div>
      )}

      <div className="max-w-[960px] mx-auto px-6 py-8">
        <div className="mb-6">
          <button
            type="button"
            onClick={() => router.push('/bundles')}
            className="border-0 bg-transparent text-blue-600 text-sm cursor-pointer p-0 mb-2"
          >
            ← Back to Dashboard
          </button>
          <h1 className="text-[22px] font-bold text-slate-800 m-0 mb-1">
            {!loaded.aiName ? (
              <span className="inline-block h-7 w-64 max-w-full bg-gray-200 rounded animate-pulse align-middle" />
            ) : (
              aiName || bundle.filename
            )}
          </h1>
          <div className="text-sm text-gray-500">
            Status: {bundle.status} ·{' '}
            {loadingFindings ? <span className="inline-block h-4 w-8 bg-gray-200 rounded animate-pulse align-middle" /> : findings.length}{' '}
            findings
          </div>
        </div>

        {findings.length === 0 && !loadingFindings && bundle.status === 'analyzing' && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-sm text-amber-900">
            ⟳ Analyzing bundle — findings will appear in ~15 seconds. Page will reload automatically.
          </div>
        )}

        <div className="flex gap-0.5 mb-5 border-b border-gray-200 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 border-0 bg-transparent text-sm whitespace-nowrap cursor-pointer mb-[-1px] ${
                activeTab === tab ? 'font-semibold text-slate-900 border-b-2 border-slate-900' : 'font-normal text-gray-500 border-b-2 border-transparent'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'Overview' && (
          <div>
            {loadingProfile ? (
              <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
                <div className="h-4 w-28 bg-gray-200 rounded animate-pulse mb-3" />
                <div className="flex gap-2 flex-wrap">
                  <div className="h-14 min-w-[100px] flex-1 max-w-[140px] rounded-md bg-gray-200 animate-pulse" />
                  <div className="h-14 min-w-[100px] flex-1 max-w-[140px] rounded-md bg-gray-200 animate-pulse" />
                  <div className="h-14 min-w-[100px] flex-1 max-w-[140px] rounded-md bg-gray-200 animate-pulse" />
                  <div className="h-14 min-w-[100px] flex-1 max-w-[140px] rounded-md bg-gray-200 animate-pulse" />
                </div>
              </div>
            ) : (
              <ClusterProfile bundleId={id} prefetched={clusterProfile} />
            )}

            <ClusterHealthGauge
              bundleId={id}
              data={gaugeData}
              skipFetch
              loadingGauge={loadingFindings}
              loadingSummary={loadingSummary}
            />

            {loadingPriority ? (
              <div className="h-[72px] rounded-lg bg-gray-200 animate-pulse mb-4" />
            ) : (
              priorityAction?.action && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveTab('Playbook')}
                  onKeyDown={e => e.key === 'Enter' && setActiveTab('Playbook')}
                  className="bg-slate-900 rounded-lg px-5 py-4 mb-4 flex items-center gap-3.5 cursor-pointer hover:opacity-90 transition-opacity"
                  title="Click to view remediation playbook"
                >
                  <div className="w-9 h-9 rounded-full bg-red-500 flex items-center justify-center text-base shrink-0 text-white">→</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold text-blue-300 uppercase tracking-wide mb-1">Start Here → Playbook</div>
                    <div className="text-sm text-slate-100 font-medium">{priorityAction.action}</div>
                  </div>
                  <div className="text-xs text-blue-300 shrink-0">View playbook →</div>
                </div>
              )
            )}

            <div className="bg-white border border-gray-200 rounded-lg px-[18px] py-3.5 mb-4">
              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2.5">By severity</div>
              {loadingFindings ? (
                <div className="flex gap-2 flex-wrap">
                  <div className="h-7 w-20 rounded-full bg-gray-200 animate-pulse" />
                  <div className="h-7 w-20 rounded-full bg-gray-200 animate-pulse" />
                  <div className="h-7 w-20 rounded-full bg-gray-200 animate-pulse" />
                </div>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  {['critical', 'high', 'medium', 'low', 'info'].map(sev => {
                    const count = findings.filter(f => f.severity === sev).length;
                    if (!count) return null;
                    return (
                      <span
                        key={sev}
                        className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
                        style={{ background: severityBg[sev], color: severityColor[sev] }}
                      >
                        {sev.toUpperCase()} {count}
                      </span>
                    );
                  })}
                  {findings.length === 0 && <span className="text-sm text-gray-500">No findings</span>}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('Playbook')}
                className="p-3.5 bg-white border border-gray-200 rounded-lg cursor-pointer text-left"
              >
                <div className="text-sm font-semibold text-slate-800 mb-1">→ View Remediation Playbook</div>
                <div className="text-xs text-gray-500">Step-by-step kubectl commands</div>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('Ask AI')}
                className="p-3.5 bg-white border border-gray-200 rounded-lg cursor-pointer text-left"
              >
                <div className="text-sm font-semibold text-slate-800 mb-1">→ Ask AI about this bundle</div>
                <div className="text-xs text-gray-500">Grounded in actual bundle data</div>
              </button>
            </div>

            <div className="mt-4">
              {loadingSimilar ? (
                <div className="bg-white border border-gray-200 rounded-lg p-5">
                  <div className="h-4 w-48 bg-gray-200 rounded animate-pulse mb-2" />
                  <div className="h-3 w-full max-w-md bg-gray-200 rounded animate-pulse mb-4" />
                  <div className="h-12 bg-gray-100 rounded animate-pulse mb-2" />
                  <div className="h-12 bg-gray-100 rounded animate-pulse" />
                </div>
              ) : (
                <SimilarIncidents bundleId={id} prefetchedSimilar={similarList} />
              )}
            </div>
          </div>
        )}

        {activeTab === 'Findings' && (
          <div>
            {loadingFindings ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
                <div
                  className="h-9 w-9 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
                  aria-hidden
                />
                <p className="text-sm font-medium m-0">Loading findings...</p>
              </div>
            ) : (
              <>
                <div className="flex gap-2 mb-4 flex-wrap">
                  {['all', 'critical', 'high', 'medium', 'low'].map(sev => {
                    const count = sev === 'all' ? findings.length : findings.filter(f => f.severity === sev).length;
                    if (count === 0 && sev !== 'all') return null;
                    return (
                      <button
                        key={sev}
                        type="button"
                        onClick={() => setSeverityFilter(sev)}
                        className={`px-3.5 py-1.5 rounded-full border text-xs font-medium cursor-pointer ${
                          severityFilter === sev ? 'border-slate-900 bg-slate-900 text-white' : 'border-gray-200 bg-white text-slate-600'
                        }`}
                      >
                        {sev === 'all' ? 'All' : sev.charAt(0).toUpperCase() + sev.slice(1)} ({count})
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-col gap-2.5">
                  {findings
                    .filter(f => severityFilter === 'all' || f.severity === severityFilter)
                    .map((f, i) => (
                      <div key={f.id || i}>
                        <FindingCard finding={{ ...f, bundle_id: f.bundle_id || id }} expanded bundleId={id} />
                        <div className="mt-1.5 flex justify-end">
                          <ConfidenceExplainer
                            bundleId={id}
                            findingId={f.id}
                            confidence={Math.round((f.confidence || 0) * 100)}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              </>
            )}
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
            <div className="bg-white border border-gray-200 rounded-lg px-[18px] py-3.5 mb-4 flex flex-wrap justify-between items-center gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-800">Generate Complete Fix Script</div>
                <div className="text-xs text-gray-500 mt-0.5">One bash script combining all remediation steps in order</div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const res = await fetch(`${API}/bundles/${id}/fix-script`, { headers: getAuthHeaders() });
                  const data = await res.json();
                  setFixScript(data.script);
                }}
                className="px-[18px] py-2 bg-slate-900 text-white border-0 rounded-md text-sm font-semibold cursor-pointer whitespace-nowrap"
              >
                Generate Fix Script
              </button>
            </div>
            {fixScript && (
              <div className="bg-slate-950 rounded-lg p-4 mb-4 relative">
                <div className="flex justify-between items-center mb-2.5">
                  <span className="text-xs font-semibold text-gray-400">remediate.sh</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(fixScript);
                      setScriptCopied(true);
                      setTimeout(() => setScriptCopied(false), 2000);
                    }}
                    className={`px-3 py-1 text-white border border-slate-600 rounded text-[11px] font-semibold cursor-pointer ${
                      scriptCopied ? 'bg-emerald-600' : 'bg-slate-800'
                    }`}
                  >
                    {scriptCopied ? '✓ Copied!' : 'Copy Script'}
                  </button>
                </div>
                <pre className="font-mono text-xs text-slate-200 m-0 whitespace-pre-wrap max-h-[300px] overflow-y-auto">{fixScript}</pre>
              </div>
            )}
            <RemediationPlaybook bundleId={id} playbook={playbook} />
          </div>
        )}
        {activeTab === 'Export' && <ExportReport bundleId={id} filename={bundle.filename ?? ''} />}
        {activeTab === 'Ask AI' && <BundleChat bundleId={id} />}
        {activeTab === 'History' && (
          <AnalysisVersionHistory
            bundleId={id}
            onReanalyze={() => {
              setBundleLoading(true);
              setTimeout(() => window.location.reload(), 22000);
            }}
          />
        )}
      </div>
    </>
  );
}
