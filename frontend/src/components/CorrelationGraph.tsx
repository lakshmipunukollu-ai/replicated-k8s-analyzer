'use client';
import { useEffect, useState, useRef } from 'react';

interface Node { id: string; title: string; severity: string; category: string; }
interface Edge { source: string; target: string; type: string; }

const SEV_COLOR: Record<string, string> = {
  critical: '#ef4444', high: '#f59e0b', medium: '#6366f1', low: '#10b981', info: '#94a3b8'
};

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

export default function CorrelationGraph({ bundleId, nodes: propNodes, edges: propEdges }: { bundleId: string; nodes?: Node[]; edges?: Edge[] }) {
  const [nodes, setNodes] = useState<Node[]>(propNodes ?? []);
  const [edges, setEdges] = useState<Edge[]>(propEdges ?? []);
  const [loading, setLoading] = useState(propNodes === undefined);
  const [selected, setSelected] = useState<Node | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const posRef = useRef<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    if (propNodes !== undefined) {
      setNodes(propNodes);
      setEdges(propEdges ?? []);
      setLoading(false);
      return;
    }
    fetch(`${API}/bundles/${bundleId}/correlations`)
      .then(r => r.json())
      .then(d => {
        setNodes(d.nodes || []);
        setEdges(d.edges || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [bundleId, propNodes, propEdges]);

  useEffect(() => {
    if (!nodes.length || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const r = Math.min(W, H) * 0.32;

    nodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
      posRef.current[n.id] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    });

    ctx.clearRect(0, 0, W, H);

    edges.forEach(e => {
      const a = posRef.current[e.source];
      const b = posRef.current[e.target];
      if (!a || !b) return;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = e.type === 'causal' ? '#ef444440' : '#94a3b840';
      ctx.lineWidth = e.type === 'causal' ? 2 : 1;
      ctx.setLineDash(e.type === 'causal' ? [] : [4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    nodes.forEach(n => {
      const pos = posRef.current[n.id];
      if (!pos) return;
      const color = SEV_COLOR[n.severity] || '#94a3b8';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 20, 0, 2 * Math.PI);
      ctx.fillStyle = color + '20';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.severity[0].toUpperCase(), pos.x, pos.y);
      ctx.fillStyle = '#374151';
      ctx.font = '10px system-ui';
      const words = n.title.split(' ').slice(0, 3).join(' ');
      ctx.fillText(words.length > 18 ? words.substring(0, 18) + '...' : words, pos.x, pos.y + 30);
    });
  }, [nodes, edges]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    for (const node of nodes) {
      const pos = posRef.current[node.id];
      if (!pos) continue;
      const dist = Math.sqrt((mx - pos.x) ** 2 + (my - pos.y) ** 2);
      if (dist < 24) { setSelected(node); return; }
    }
    setSelected(null);
  };

  if (loading) return <div style={{ padding: '20px', color: '#64748b', fontSize: '13px' }}>Building correlation graph...</div>;
  if (!nodes.length) return <div style={{ padding: '20px', color: '#94a3b8', fontSize: '13px' }}>No findings to correlate</div>;

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '18px' }}>
      <div style={{ marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>Finding Correlation Graph</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Solid lines = causal · Dashed = related · Click a node to inspect</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {Object.entries(SEV_COLOR).slice(0, 4).map(([sev, color]) => (
            <span key={sev} style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, display: 'inline-block' }} />
              {sev}
            </span>
          ))}
        </div>
      </div>
      <canvas ref={canvasRef} width={700} height={340} onClick={handleCanvasClick}
        style={{ width: '100%', height: '340px', cursor: 'pointer', borderRadius: '6px', background: '#fafafa', border: '0.5px solid #e2e8f0' }} />
      {selected && (
        <div style={{ marginTop: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ background: SEV_COLOR[selected.severity] + '20', color: SEV_COLOR[selected.severity], fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', textTransform: 'uppercase' as const }}>{selected.severity}</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{selected.title}</span>
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            Connected to {edges.filter(e => e.source === selected.id || e.target === selected.id).length} other finding(s)
          </div>
        </div>
      )}
    </div>
  );
}
