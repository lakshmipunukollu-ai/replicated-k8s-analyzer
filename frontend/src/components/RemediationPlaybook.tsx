'use client';
import { useEffect, useState } from 'react';

interface Step { step: number; label: string; type: string; cmd: string; color: string; bg: string; text_color: string; }
export interface Playbook { finding_title: string; severity: string; steps: Step[]; }

import { getAuthHeaders } from '@/lib/api';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';

export default function RemediationPlaybook({ bundleId, playbook: propPlaybook }: { bundleId: string; playbook?: Playbook[] }) {
  const [playbooks, setPlaybooks] = useState<Playbook[]>(propPlaybook ?? []);
  const [loading, setLoading] = useState(propPlaybook === undefined);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (propPlaybook !== undefined) {
      setPlaybooks(propPlaybook);
      setLoading(false);
      return;
    }
    fetch(`${API}/bundles/${bundleId}/playbook`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => {
        setPlaybooks(d.playbook || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [bundleId, propPlaybook]);

  const copy = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopied(cmd);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) return <div style={{ padding: '20px', color: '#64748b', fontSize: '13px' }}>Generating playbook...</div>;
  if (!playbooks.length) return <div style={{ padding: '20px', color: '#94a3b8', fontSize: '13px' }}>No critical findings require remediation</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {playbooks.map((pb, pi) => (
        <div key={pi} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', background: pb.severity === 'critical' ? '#fee2e2' : '#fef3c7', color: pb.severity === 'critical' ? '#991b1b' : '#92400e', padding: '2px 8px', borderRadius: '20px', fontWeight: 600, textTransform: 'uppercase' as const }}>{pb.severity}</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{pb.finding_title}</span>
          </div>
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {pb.steps.map((step, si) => (
              <div key={si} style={{ background: step.bg, borderRadius: '6px', padding: '10px 12px', borderLeft: `3px solid ${step.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#1e293b' }}>Step {step.step} — {step.label}</div>
                  <span style={{ fontSize: '10px', background: '#fff', color: step.text_color, padding: '2px 8px', borderRadius: '4px', fontWeight: 600, border: `1px solid ${step.color}30` }}>{step.type}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <code style={{ flex: 1, fontFamily: 'monospace', fontSize: '11px', background: '#fff', padding: '7px 10px', borderRadius: '5px', color: '#374151', border: '0.5px solid #e2e8f0', display: 'block', overflow: 'auto' }}>
                    {step.cmd}
                  </code>
                  <button
                    onClick={() => copy(step.cmd)}
                    style={{ flexShrink: 0, padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', background: copied === step.cmd ? '#f0fdf4' : '#fff', color: copied === step.cmd ? '#15803d' : '#475569', fontSize: '11px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const }}
                  >
                    {copied === step.cmd ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
