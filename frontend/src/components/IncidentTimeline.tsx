'use client';
import { useEffect, useState } from 'react';

interface TimelineEvent {
  timestamp: string;
  title: string;
  description: string;
  severity: string;
  source: string;
  color: string;
  evidence: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';

export default function IncidentTimeline({ bundleId, events: propEvents }: { bundleId: string; events?: TimelineEvent[] }) {
  const [events, setEvents] = useState<TimelineEvent[]>(propEvents ?? []);
  const [loading, setLoading] = useState(!propEvents?.length);

  useEffect(() => {
    if (propEvents !== undefined) {
      setEvents(propEvents);
      setLoading(false);
      return;
    }
    fetch(`${API}/bundles/${bundleId}/timeline`)
      .then(r => r.json())
      .then(d => {
        setEvents(d.events || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [bundleId, propEvents]);

  if (loading) return <div style={{ padding: '20px', color: '#64748b', fontSize: '13px' }}>Building timeline...</div>;
  if (!events.length) return <div style={{ padding: '20px', color: '#94a3b8', fontSize: '13px' }}>No timeline events available</div>;

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '18px' }}>
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>Incident Timeline</div>
        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Events reconstructed from all log sources</div>
      </div>
      <div style={{ position: 'relative', paddingLeft: '28px' }}>
        <div style={{ position: 'absolute', left: '10px', top: 0, bottom: 0, width: '1px', background: '#e2e8f0' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {events.map((event, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: '-22px', top: '4px', width: '10px', height: '10px', borderRadius: '50%', background: event.color, border: '2px solid #fff', boxShadow: '0 0 0 1px #e2e8f0' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', fontFamily: 'monospace' }}>{event.timestamp}</span>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>·</span>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>{event.source}</span>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: event.color, marginLeft: '4px' }} />
              </div>
              <div style={{ fontSize: '13px', fontWeight: 500, color: '#1e293b', marginBottom: '2px' }}>{event.title}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>{event.description}</div>
              {event.evidence && (
                <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748b', background: '#f8fafc', padding: '4px 8px', borderRadius: '4px', marginTop: '5px', border: '0.5px solid #e2e8f0' }}>
                  {event.evidence.substring(0, 80)}{event.evidence.length > 80 ? '...' : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
