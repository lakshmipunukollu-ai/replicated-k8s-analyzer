'use client';
import { useEffect, useState } from 'react';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';

const KNOWN_PATTERNS = [
  {
    id: 'oomkill',
    name: 'OOMKill — Container Memory Limit Exceeded',
    category: 'Resource',
    severity: 'critical',
    description: 'Container is killed by the kernel OOM killer because it exceeded its memory limit.',
    signatures: ['OOMKilled', 'exceeded memory limit', 'Memory cgroup out of memory'],
    remediation: 'Increase memory limits, profile application memory usage',
    learnMore: 'https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/',
  },
  {
    id: 'crashloop',
    name: 'CrashLoopBackOff — Repeated Container Crashes',
    category: 'Resource',
    severity: 'critical',
    description: 'Container is repeatedly crashing and Kubernetes is backing off restarts exponentially.',
    signatures: ['CrashLoopBackOff', 'Back-off restarting failed container', 'Error: exit code'],
    remediation: 'Check logs from previous container instance, fix root cause, adjust resource limits',
    learnMore: 'https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/',
  },
  {
    id: 'memory-pressure',
    name: 'MemoryPressure — Node Running Low on Memory',
    category: 'Node',
    severity: 'high',
    description: 'Node is experiencing memory pressure and may start evicting pods.',
    signatures: ['MemoryPressure', 'Node condition MemoryPressure', 'kubelet has memory pressure'],
    remediation: 'Add nodes to cluster, reduce memory requests, evict non-critical workloads',
    learnMore: 'https://kubernetes.io/docs/concepts/scheduling-eviction/node-pressure-eviction/',
  },
  {
    id: 'disk-pressure',
    name: 'DiskPressure — Node Running Low on Disk',
    category: 'Node',
    severity: 'high',
    description: 'Node filesystem is running out of space, pod scheduling may fail.',
    signatures: ['DiskPressure', 'kubelet has disk pressure', 'no space left on device'],
    remediation: 'Clear unused images, expand node storage, clean up logs',
    learnMore: 'https://kubernetes.io/docs/concepts/scheduling-eviction/node-pressure-eviction/',
  },
  {
    id: 'pvc-unbound',
    name: 'PVC Unbound — Storage Provisioning Failure',
    category: 'Storage',
    severity: 'high',
    description: 'PersistentVolumeClaim cannot be bound to a PersistentVolume.',
    signatures: ['no persistent volumes available', 'ProvisioningFailed', 'unbound immediate PersistentVolumeClaims'],
    remediation: 'Check StorageClass provisioner, create PersistentVolumes, verify storage credentials',
    learnMore: 'https://kubernetes.io/docs/concepts/storage/persistent-volumes/',
  },
  {
    id: 'etcd-unavailable',
    name: 'etcd Cluster Unavailable',
    category: 'Control Plane',
    severity: 'critical',
    description: 'etcd cluster is down or unreachable, causing API server failures.',
    signatures: ['etcd cluster is unavailable', 'failed to send out heartbeat', 'lost leader election'],
    remediation: 'Check etcd pod logs, verify etcd cluster quorum, restore from backup',
    learnMore: 'https://etcd.io/docs/v3.4/op-guide/recovery/',
  },
  {
    id: 'coredns-fail',
    name: 'CoreDNS Failure — DNS Resolution Broken',
    category: 'Network',
    severity: 'critical',
    description: 'CoreDNS is failing causing DNS resolution failures across the cluster.',
    signatures: ['SERVFAIL', 'plugin/errors: 2 SERVFAIL', 'failed to list *v1.Service'],
    remediation: 'Restart CoreDNS pods, check CoreDNS configmap, verify etcd connectivity',
    learnMore: 'https://kubernetes.io/docs/tasks/administer-cluster/dns-debugging-resolution/',
  },
  {
    id: 'image-pull',
    name: 'ImagePullBackOff — Cannot Pull Container Image',
    category: 'Application',
    severity: 'medium',
    description: 'Kubernetes cannot pull the container image from the registry.',
    signatures: ['ImagePullBackOff', 'ErrImagePull', 'Failed to pull image'],
    remediation: 'Check image name/tag, verify registry credentials, check network connectivity',
    learnMore: 'https://kubernetes.io/docs/concepts/containers/images/',
  },
];

const SEV_STYLE: Record<string, { bg: string; color: string }> = {
  critical: { bg: '#fee2e2', color: '#991b1b' },
  high: { bg: '#fef3c7', color: '#92400e' },
  medium: { bg: '#ede9fe', color: '#6d28d9' },
  low: { bg: '#dcfce7', color: '#15803d' },
};

const CAT_COLORS: Record<string, string> = {
  'Resource': '#2563eb',
  'Node': '#7c3aed',
  'Storage': '#059669',
  'Network': '#dc2626',
  'Control Plane': '#d97706',
  'Application': '#64748b',
};

export default function PatternsPage() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch(`${API}/bundles`)
      .then(r => r.json())
      .then(async d => {
        const bundles = (d.bundles || []).filter((b: any) => b.status === 'completed');
        const patternCounts: Record<string, number> = {};
        for (const bundle of bundles) {
          try {
            const report = await fetch(`${API}/bundles/${bundle.id}/report`).then(r => r.json());
            const findings = report.findings || [];
            findings.forEach((f: any) => {
              const titleLower = f.title?.toLowerCase() || '';
              const descLower = (f.description || f.summary || '').toLowerCase();
              KNOWN_PATTERNS.forEach(p => {
                if (p.signatures.some(s => titleLower.includes(s.toLowerCase()) || descLower.includes(s.toLowerCase()))) {
                  patternCounts[p.id] = (patternCounts[p.id] || 0) + 1;
                }
              });
            });
          } catch { }
        }
        setCounts(patternCounts);
      })
      .catch(() => { });
  }, []);

  const categories = ['all', ...Array.from(new Set(KNOWN_PATTERNS.map(p => p.category)))];

  const filtered = KNOWN_PATTERNS.filter(p => {
    if (filter !== 'all' && p.category !== filter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) &&
      !p.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>Pattern Library</h1>
        <p style={{ color: '#64748b', margin: 0, fontSize: '13px' }}>
          {KNOWN_PATTERNS.length} known failure patterns · Detected automatically by AI analysis
        </p>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' as const }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search patterns..."
          style={{ flex: 1, minWidth: '200px', padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', color: '#1e293b' }}
        />
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setFilter(cat)} style={{
              padding: '7px 14px', borderRadius: '20px', border: '1px solid',
              borderColor: filter === cat ? '#1e3a5f' : '#e2e8f0',
              background: filter === cat ? '#1e3a5f' : '#fff',
              color: filter === cat ? '#fff' : '#475569',
              fontSize: '12px', fontWeight: 500, cursor: 'pointer',
            }}>
              {cat === 'all' ? 'All' : cat}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>
        {filtered.map(pattern => {
          const sevStyle = SEV_STYLE[pattern.severity];
          const catColor = CAT_COLORS[pattern.category] || '#64748b';
          const seenCount = counts[pattern.id] || 0;

          return (
            <div key={pattern.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #f8fafc', display: 'flex', alignItems: 'center', gap: '10px', background: '#fafafa' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 9px', borderRadius: '20px', textTransform: 'uppercase' as const, background: sevStyle.bg, color: sevStyle.color }}>
                  {pattern.severity}
                </span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: catColor, background: catColor + '15', padding: '2px 9px', borderRadius: '20px' }}>
                  {pattern.category}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', flex: 1 }}>{pattern.name}</span>
                {seenCount > 0 && (
                  <span style={{ fontSize: '11px', background: '#fee2e2', color: '#991b1b', padding: '2px 9px', borderRadius: '20px', fontWeight: 600 }}>
                    Seen {seenCount}× in your bundles
                  </span>
                )}
              </div>
              <div style={{ padding: '14px 18px' }}>
                <p style={{ fontSize: '13px', color: '#374151', marginBottom: '12px', lineHeight: '1.6' }}>{pattern.description}</p>

                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: '5px' }}>Log signatures</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '5px' }}>
                    {pattern.signatures.map((sig, i) => (
                      <code key={i} style={{ fontSize: '11px', background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '4px', fontFamily: 'monospace' }}>
                        {sig}
                      </code>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    <strong>Fix:</strong> {pattern.remediation}
                  </div>
                  <a href={pattern.learnMore} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: '12px', color: '#2563eb', textDecoration: 'none', fontWeight: 500, flexShrink: 0, marginLeft: '12px' }}>
                    K8s docs →
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
