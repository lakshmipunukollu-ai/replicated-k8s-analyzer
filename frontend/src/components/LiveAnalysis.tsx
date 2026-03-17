'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface Finding {
  title: string;
  severity: string;
  description: string;
  root_cause: string;
  confidence: number;
}

interface LiveAnalysisProps {
  bundleId: string;
  filename: string;
}

const SEV_COLOR: Record<string, string> = {
  critical: '#ef4444', high: '#f59e0b', medium: '#6366f1', low: '#10b981', info: '#94a3b8'
};
const SEV_BG: Record<string, string> = {
  critical: '#fef2f2', high: '#fffbeb', medium: '#f5f3ff', low: '#f0fdf4', info: '#f8fafc'
};

const SCAN_STEPS = [
  'Unpacking bundle archive...',
  'Indexing log files...',
  'Scanning for OOMKill signatures...',
  'Checking node health conditions...',
  'Analyzing storage provisioner...',
  'Correlating failure patterns...',
  'Running AI analysis...',
];

export default function LiveAnalysis({ bundleId, filename }: LiveAnalysisProps) {
  const router = useRouter();
  const [status, setStatus] = useState('Initializing...');
  const [findings, setFindings] = useState<Finding[]>([]);
  const [complete, setComplete] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [dots, setDots] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const dotsInterval = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 400);
    const stepInterval = setInterval(() => setScanStep(s => s < SCAN_STEPS.length - 1 ? s + 1 : s), 1800);
    return () => { clearInterval(dotsInterval); clearInterval(stepInterval); };
  }, []);

  useEffect(() => {
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
    const es = new EventSource(`${API}/bundles/${bundleId}/analyze/stream`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'status') {
          setStatus(data.message);
        } else if (data.type === 'finding') {
          setFindings(prev => [...prev, data.finding]);
        } else if (data.type === 'complete') {
          setComplete(true);
          es.close();
          setTimeout(() => router.push(`/bundles/${bundleId}`), 1500);
        } else if (data.type === 'error') {
          es.close();
          setTimeout(() => router.push(`/bundles/${bundleId}`), 1000);
        }
      } catch { }
    };

    es.onerror = () => {
      es.close();
      setTimeout(() => router.push(`/bundles/${bundleId}`), 1000);
    };

    return () => es.close();
  }, [bundleId, router]);

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '40px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px', fontFamily: 'monospace' }}>{filename}</div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b', margin: '0 0 8px 0' }}>
          {complete ? '✓ Analysis Complete' : 'Analyzing bundle'}
        </h1>
        {!complete && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2563eb', animation: 'pulse 1s infinite' }} />
            <span style={{ fontSize: '13px', color: '#64748b' }}>{status}{dots}</span>
          </div>
        )}
        {complete && <div style={{ fontSize: '13px', color: '#10b981' }}>Redirecting to full report...</div>}
      </div>

      {/* Scan steps */}
      {!complete && (
        <div style={{ background: '#0f172a', borderRadius: '8px', padding: '16px 20px', marginBottom: '24px' }}>
          {SCAN_STEPS.map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', fontSize: '12px', color: i < scanStep ? '#10b981' : i === scanStep ? '#38bdf8' : '#334155', fontWeight: i === scanStep ? 600 : 400 }}>
              <span style={{ width: '14px', textAlign: 'center' as const, fontFamily: 'monospace' }}>
                {i < scanStep ? '✓' : i === scanStep ? '›' : '·'}
              </span>
              {step}
            </div>
          ))}
        </div>
      )}

      {/* Live findings */}
      {findings.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
              {findings.length} finding{findings.length !== 1 ? 's' : ''} discovered
            </span>
            {!complete && <span style={{ fontSize: '11px', color: '#94a3b8' }}>— appearing in real time</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {findings.map((f, i) => (
              <div key={i} style={{
                background: '#fff', border: `1px solid ${SEV_COLOR[f.severity] || '#e2e8f0'}30`,
                borderLeft: `3px solid ${SEV_COLOR[f.severity] || '#94a3b8'}`,
                borderRadius: '8px', padding: '12px 16px',
                animation: 'slideIn 0.3s ease',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                  <span style={{ background: SEV_BG[f.severity], color: SEV_COLOR[f.severity], fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', textTransform: 'uppercase' as const }}>
                    {f.severity}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{f.title}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#94a3b8' }}>
                    {Math.round((f.confidence || 0) * 100)}% confidence
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', lineHeight: '1.5' }}>{f.description}</div>
                {f.root_cause && (
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '5px' }}>
                    <strong>Root cause:</strong> {f.root_cause}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {findings.length === 0 && !complete && (
        <div style={{ textAlign: 'center' as const, padding: '40px', color: '#94a3b8', fontSize: '13px' }}>
          Findings will appear here as they are discovered...
        </div>
      )}

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
