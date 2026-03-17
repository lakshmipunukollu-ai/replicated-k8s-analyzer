'use client';

import { useEffect, useState, useRef, useMemo } from 'react';

interface Node {
  id: string;
  title: string;
  severity: string;
  category: string;
  summary?: string;
  root_cause?: string;
  impact?: string;
  recommended_actions?: string[];
}

interface Edge {
  source: string;
  target: string;
  type: string;
}

const SEV_COLOR: Record<string, string> = {
  critical: '#ef4444',
  high: '#f59e0b',
  medium: '#6366f1',
  low: '#10b981',
  info: '#94a3b8',
};
const SEV_BG: Record<string, string> = {
  critical: '#fee2e2',
  high: '#fef3c7',
  medium: '#ede9fe',
  low: '#dcfce7',
  info: '#f8fafc',
};

const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;

// Client-side edge explanation lookup (keyword pairs → explanation)
function getEdgeExplanation(titleA: string, titleB: string, type: string): string {
  const a = titleA.toLowerCase();
  const b = titleB.toLowerCase();
  const has = (...keywords: string[]) => keywords.some((k) => a.includes(k) || b.includes(k));
  const both = (k: string) => a.includes(k) && b.includes(k);
  const one = (k: string) => a.includes(k) || b.includes(k);
  if (has('oom', 'oomkill', 'oomkilled') && has('crash', 'crashloop', 'backoff')) return 'Memory exhaustion killed the container, triggering restart loops.';
  if (has('oom', 'oomkill') && has('memory', 'pressure')) return 'Both findings share the same memory pressure root cause.';
  if (has('crash', 'crashloop', 'backoff') && has('restart')) return 'Repeated crashes triggered Kubernetes restart backoff.';
  if (has('memory') && has('pressure')) return 'Memory limits caused node-level pressure conditions.';
  if (has('pvc', 'persistent') && has('storage', 'volume', 'mount')) return 'Storage provisioning failure prevented pod scheduling.';
  if (has('node') && has('memory', 'pressure')) return 'Node memory pressure affected pod scheduling and stability.';
  if (has('dns', 'coredns') && has('crash', 'fail')) return 'DNS resolution failures caused downstream service crashes.';
  if (has('image', 'pull') && has('crash', 'backoff')) return 'Image pull failures prevented container initialization.';
  return 'These findings share a common failure category or causal chain.';
}

function truncate(str: string, n: number) {
  const words = str.split(' ');
  if (words.length <= 3) return str;
  return words.slice(0, 3).join(' ') + '...';
}

export default function CorrelationGraph({
  bundleId,
  nodes: propNodes,
  edges: propEdges,
  findings: findingsLookup,
  onNavigateToFindings,
}: {
  bundleId: string;
  nodes?: Node[];
  edges?: Edge[];
  findings?: Array<{ id: string; title?: string; summary?: string; root_cause?: string; impact?: string; recommended_actions?: string[] }>;
  onNavigateToFindings?: () => void;
}) {
  const [nodes, setNodes] = useState<Node[]>(propNodes || []);
  const [edges, setEdges] = useState<Edge[]>(propEdges || []);
  const [loading, setLoading] = useState(!propNodes);
  const [visibleSeverities, setVisibleSeverities] = useState<Set<string>>(() => new Set(SEVERITIES));
  const [selected, setSelected] = useState<Node | null>(null);
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [clickedEdge, setClickedEdge] = useState<{ edge: Edge; nodeA: Node; nodeB: Node; x: number; y: number } | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainResult, setExplainResult] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'graph' | 'timeline'>('graph');
  const containerRef = useRef<HTMLDivElement>(null);

  const findingsById = useMemo(() => {
    const m: Record<string, typeof findingsLookup[0]> = {};
    (findingsLookup || []).forEach((f) => { m[f.id] = f; });
    return m;
  }, [findingsLookup]);

  useEffect(() => {
    if (propNodes) {
      setNodes(propNodes);
      setEdges(propEdges || []);
      setLoading(false);
      return;
    }
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';
    fetch(`${API}/bundles/${bundleId}/correlations`)
      .then((r) => r.json())
      .then((d) => {
        setNodes(d.nodes || []);
        setEdges(d.edges || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [bundleId, propNodes, propEdges]);

  const filteredNodes = useMemo(
    () => nodes.filter((n) => visibleSeverities.has(n.severity)),
    [nodes, visibleSeverities],
  );
  const visibleIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);
  const filteredEdges = useMemo(
    () => edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)),
    [edges, visibleIds],
  );

  const severityCounts = useMemo(() => {
    const c: Record<string, number> = {};
    nodes.forEach((n) => { c[n.severity] = (c[n.severity] || 0) + 1; });
    return c;
  }, [nodes]);

  const toggleSeverity = (sev: string) => {
    setVisibleSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(sev)) next.delete(sev);
      else next.add(sev);
      return next;
    });
  };

  const W = 800;
  const H = 380;
  const cx = W / 2;
  const cy = H / 2;
  const r = Math.min(W, H) * 0.33;
  const nodeR = 38;

  const positions: Record<string, { x: number; y: number }> = {};
  filteredNodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(filteredNodes.length, 1) - Math.PI / 2;
    positions[n.id] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });

  const connCount = (id: string) => filteredEdges.filter((e) => e.source === id || e.target === id).length;

  const handleNodeMouseEnter = (node: Node, e: React.MouseEvent) => {
    setHoveredNode(node);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      let x = e.clientX + 12;
      let y = e.clientY + 12;
      const tw = 280;
      const th = 120;
      if (x + tw > window.innerWidth) x = e.clientX - tw - 8;
      if (y + th > window.innerHeight) y = window.innerHeight - th - 8;
      if (x < 8) x = 8;
      if (y < 8) y = 8;
      setTooltipPos({ x, y });
    }
  };

  const handleNodeMouseLeave = () => setHoveredNode(null);

  const getFindingDetail = (node: Node) => findingsById[node.id] || node;

  const handleEdgeClick = (e: React.MouseEvent, edge: Edge) => {
    e.stopPropagation();
    const nodeA = filteredNodes.find((n) => n.id === edge.source);
    const nodeB = filteredNodes.find((n) => n.id === edge.target);
    if (!nodeA || !nodeB) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setClickedEdge({
      edge,
      nodeA,
      nodeB,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleExplainCluster = async () => {
    setExplainLoading(true);
    setExplainResult(null);
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';
    try {
      const res = await fetch(`${API}/bundles/${bundleId}/explain-correlations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: filteredNodes.map((n) => ({ title: n.title, severity: n.severity, category: n.category })),
          edges: filteredEdges.map((e) => ({ source: e.source, target: e.target, type: e.type })),
        }),
      });
      const data = await res.json();
      setExplainResult(data.explanation || 'No explanation generated.');
    } catch {
      setExplainResult('Failed to generate explanation.');
    } finally {
      setExplainLoading(false);
    }
  };

  const causalDepths = useMemo(() => {
    const depths: Record<string, number> = {};
    const targets = new Set(filteredEdges.map((e) => e.target));
    filteredNodes.forEach((n) => {
      if (!targets.has(n.id)) depths[n.id] = 0;
    });
    let changed = true;
    while (changed) {
      changed = false;
      filteredEdges.forEach((e) => {
        if (depths[e.source] !== undefined && (depths[e.target] === undefined || depths[e.target]! > depths[e.source]! + 1)) {
          depths[e.target] = depths[e.source]! + 1;
          changed = true;
        }
      });
    }
    filteredNodes.forEach((n) => {
      if (depths[n.id] === undefined) depths[n.id] = 0;
    });
    return depths;
  }, [filteredNodes, filteredEdges]);

  const timelineColumns = useMemo(() => {
    const maxD = Math.max(0, ...Object.values(causalDepths));
    const cols: Node[][] = Array.from({ length: maxD + 1 }, () => []);
    filteredNodes.forEach((n) => {
      const d = causalDepths[n.id] ?? 0;
      cols[d].push(n);
    });
    return cols;
  }, [filteredNodes, causalDepths]);

  if (loading) return <div style={{ padding: '20px', color: '#64748b', fontSize: '13px' }}>Building correlation graph...</div>;
  if (!nodes.length) return <div style={{ padding: '20px', color: '#94a3b8', fontSize: '13px' }}>No findings to correlate</div>;

  return (
    <div ref={containerRef} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '18px', position: 'relative' }}>
      {/* Explain + View toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={handleExplainCluster}
            disabled={explainLoading || filteredNodes.length === 0}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              background: explainLoading ? '#cbd5e1' : '#1e3a5f',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: explainLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {explainLoading ? 'Analyzing failure cascade...' : '✨ Explain This Cluster'}
          </button>
          <div style={{ display: 'flex', gap: '4px' }}>
            {(['graph', 'timeline'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${viewMode === mode ? '#1e3a5f' : '#e2e8f0'}`,
                  background: viewMode === mode ? '#1e3a5f' : '#fff',
                  color: viewMode === mode ? '#fff' : '#475569',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                {mode === 'graph' ? 'Graph View' : 'Timeline View'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Failure cascade panel */}
      {explainResult !== null && (
        <div style={{ marginBottom: '12px', padding: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>Failure Cascade Analysis</span>
            <button type="button" onClick={() => setExplainResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '18px' }}>×</button>
          </div>
          <p style={{ fontSize: '13px', color: '#374151', lineHeight: 1.6, margin: 0 }}>{explainResult}</p>
        </div>
      )}

      {/* Severity filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {SEVERITIES.map((sev) => (
          <label key={sev} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', color: '#475569' }}>
            <input
              type="checkbox"
              checked={visibleSeverities.has(sev)}
              onChange={() => toggleSeverity(sev)}
              style={{ width: '16px', height: '16px' }}
            />
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: SEV_COLOR[sev] }} />
            {sev.charAt(0).toUpperCase() + sev.slice(1)} ({severityCounts[sev] ?? 0})
          </label>
        ))}
      </div>

      {viewMode === 'graph' && (
        <>
          <div style={{ background: '#fafafa', borderRadius: '8px', border: '1px solid #f1f5f9', overflow: 'hidden', position: 'relative' }}>
            <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill="#94a3b8" />
                </marker>
              </defs>
              {filteredEdges.map((edge, i) => {
                const a = positions[edge.source];
                const b = positions[edge.target];
                if (!a || !b) return null;
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const tx = b.x - (nodeR + 10) * (dx / dist);
                const ty = b.y - (nodeR + 10) * (dy / dist);
                const sx = a.x + nodeR * (dx / dist);
                const sy = a.y + nodeR * (dy / dist);
                const midX = (sx + tx) / 2;
                const midY = (sy + ty) / 2;
                return (
                  <g key={i}>
                    <line
                      x1={sx}
                      y1={sy}
                      x2={tx}
                      y2={ty}
                      stroke={edge.type === 'causal' ? '#94a3b8' : '#cbd5e1'}
                      strokeWidth={edge.type === 'causal' ? 2 : 1.5}
                      strokeDasharray={edge.type === 'causal' ? 'none' : '6 4'}
                      markerEnd={edge.type === 'causal' ? 'url(#arrow)' : undefined}
                      opacity={selected ? (edge.source === selected.id || edge.target === selected.id ? 1 : 0.2) : 0.7}
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => handleEdgeClick(e, edge)}
                    />
                    <line
                      x1={midX - 15}
                      y1={midY}
                      x2={midX + 15}
                      y2={midY}
                      stroke="transparent"
                      strokeWidth={20}
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => handleEdgeClick(e, edge)}
                    />
                  </g>
                );
              })}
              {filteredNodes.map((node) => {
                const p = positions[node.id];
                if (!p) return null;
                const color = SEV_COLOR[node.severity] || '#94a3b8';
                const bg = SEV_BG[node.severity] || '#f8fafc';
                const isSelected = selected?.id === node.id;
                const label = truncate(node.title, 3);
                const words = label.split(' ');
                const line1 = words.slice(0, 2).join(' ');
                const line2 = words.slice(2).join(' ');
                return (
                  <g
                    key={node.id}
                    onClick={() => setSelected(isSelected ? null : node)}
                    onMouseEnter={(e) => handleNodeMouseEnter(node, e)}
                    onMouseLeave={handleNodeMouseLeave}
                    style={{ cursor: 'pointer' }}
                  >
                    {isSelected && (
                      <circle cx={p.x} cy={p.y} r={nodeR + 8} fill={color + '25'} stroke={color} strokeWidth={2} />
                    )}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={nodeR}
                      fill={isSelected ? color : bg}
                      stroke={color}
                      strokeWidth={isSelected ? 3 : 2}
                      opacity={selected && !isSelected ? 0.4 : 1}
                    />
                    <text
                      x={p.x}
                      y={line2 ? p.y - 7 : p.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="11"
                      fontWeight="600"
                      fill={isSelected ? '#fff' : color}
                      opacity={selected && !isSelected ? 0.5 : 1}
                    >
                      {line1}
                    </text>
                    {line2 && (
                      <text
                        x={p.x}
                        y={p.y + 9}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="11"
                        fontWeight="600"
                        fill={isSelected ? '#fff' : color}
                        opacity={selected && !isSelected ? 0.5 : 1}
                      >
                        {line2}
                      </text>
                    )}
                    <circle cx={p.x + nodeR - 8} cy={p.y - nodeR + 8} r={7} fill={color} stroke="#fff" strokeWidth={2} />
                    <text x={p.x + nodeR - 8} y={p.y - nodeR + 8} textAnchor="middle" dominantBaseline="middle" fontSize="8" fontWeight="700" fill="#fff">
                      {node.severity[0].toUpperCase()}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Edge popover (in SVG coords we need to render in a div overlay) */}
          {clickedEdge && (
            <div
              role="presentation"
              style={{ position: 'absolute', inset: 0, zIndex: 5 }}
              onClick={() => setClickedEdge(null)}
            >
              <div
                style={{
                  position: 'absolute',
                  left: Math.min(clickedEdge.x + 12, W - 260),
                  top: Math.min(clickedEdge.y + 12, H - 80),
                  width: '240px',
                  padding: '10px 12px',
                  background: '#fff',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  zIndex: 10,
                  fontSize: '12px',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '6px' }}>Why are these connected?</div>
                <p style={{ margin: 0, color: '#475569', lineHeight: 1.4 }}>
                  {getEdgeExplanation(clickedEdge.nodeA.title, clickedEdge.nodeB.title, clickedEdge.edge.type)}
                </p>
              </div>
            </div>
          )}

          {/* Hover tooltip (fixed position) */}
          {hoveredNode && (
            <div
              style={{
                position: 'fixed',
                left: tooltipPos.x,
                top: tooltipPos.y,
                width: '280px',
                padding: '10px 12px',
                background: '#fff',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                zIndex: 1000,
                pointerEvents: 'none',
                fontSize: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <span
                  style={{
                    background: SEV_BG[hoveredNode.severity],
                    color: SEV_COLOR[hoveredNode.severity],
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    textTransform: 'uppercase',
                  }}
                >
                  {hoveredNode.severity}
                </span>
                <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px' }}>{hoveredNode.category}</span>
              </div>
              <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>{hoveredNode.title}</div>
              <div style={{ color: '#64748b' }}>
                {((hoveredNode.summary ?? getFindingDetail(hoveredNode).summary) || '').slice(0, 100)}
                {((hoveredNode.summary ?? getFindingDetail(hoveredNode).summary) || '').length > 100 ? '...' : ''}
              </div>
            </div>
          )}
        </>
      )}

      {viewMode === 'timeline' && (
        <div style={{ overflowX: 'auto', paddingBottom: '8px' }}>
          <div style={{ display: 'flex', gap: '24px', minWidth: 'max-content', alignItems: 'flex-start', padding: '16px 0' }}>
            {timelineColumns.map((colNodes, depth) => (
              <div key={depth} style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '200px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                  {depth === 0 ? 'Root causes' : `Depth ${depth}`}
                </div>
                {colNodes.map((node) => {
                  const color = SEV_COLOR[node.severity] || '#94a3b8';
                  const bg = SEV_BG[node.severity] || '#f8fafc';
                  const outEdges = filteredEdges.filter((e) => e.source === node.id);
                  const isSelected = selected?.id === node.id;
                  return (
                    <div
                      key={node.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelected(isSelected ? null : node)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(isSelected ? null : node); } }}
                      style={{
                        padding: '10px 12px',
                        background: bg,
                        border: `1px solid ${color}40`,
                        borderRadius: '8px',
                        borderLeft: `3px solid ${color}`,
                        cursor: 'pointer',
                        outline: isSelected ? `2px solid ${color}` : undefined,
                        outlineOffset: 2,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color, textTransform: 'uppercase' }}>{node.severity}</span>
                        <span style={{ fontSize: '10px', color: '#64748b' }}>{node.category}</span>
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#1e293b' }}>{truncate(node.title, 5)}</div>
                      {outEdges.length > 0 && (
                        <div style={{ marginTop: '6px', fontSize: '10px', color: '#94a3b8' }}>→ {outEdges.length} downstream</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selected node detail panel (slide up) */}
      {selected && (
        <div
          style={{
            marginTop: '12px',
            padding: '16px 18px',
            background: '#fff',
            border: `1px solid ${SEV_COLOR[selected.severity]}40`,
            borderLeft: `4px solid ${SEV_COLOR[selected.severity]}`,
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            animation: 'slideUp 0.25s ease-out',
          }}
        >
          <style>{`@keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span
                style={{
                  background: SEV_BG[selected.severity],
                  color: SEV_COLOR[selected.severity],
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: '20px',
                  textTransform: 'uppercase',
                }}
              >
                {selected.severity}
              </span>
              <span style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>{selected.title}</span>
            </div>
            <button type="button" onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '20px', lineHeight: 1 }}>×</button>
          </div>
          {(() => {
            const detail = getFindingDetail(selected);
            const rootCause = detail.root_cause ?? selected.root_cause;
            const impact = detail.impact ?? selected.impact;
            const actions = detail.recommended_actions ?? selected.recommended_actions ?? [];
            return (
              <>
                {rootCause && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Root cause</div>
                    <p style={{ fontSize: '13px', color: '#374151', margin: 0, lineHeight: 1.5 }}>{rootCause}</p>
                  </div>
                )}
                {impact && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Impact</div>
                    <p style={{ fontSize: '13px', color: '#374151', margin: 0, lineHeight: 1.5 }}>{impact}</p>
                  </div>
                )}
                {actions.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Recommended actions</div>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: '#374151', lineHeight: 1.6 }}>
                      {actions.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            );
          })()}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
            {onNavigateToFindings && (
              <button
                type="button"
                onClick={onNavigateToFindings}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: '1px solid #1e3a5f',
                  background: '#fff',
                  color: '#1e3a5f',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                View in Findings tab
              </button>
            )}
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              Connected to {connCount(selected.id)} finding{connCount(selected.id) !== 1 ? 's' : ''} · {selected.category}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
