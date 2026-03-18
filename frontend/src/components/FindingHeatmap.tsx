'use client';
import { useEffect, useState } from 'react';
import { getAuthHeaders } from '@/lib/api';

interface DayData {
  date: string;
  count: number;
  bundles: string[];
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';

export default function FindingHeatmap() {
  const [data, setData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ day: DayData; x: number; y: number } | null>(null);

  useEffect(() => {
    fetch(`${API}/bundles`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => {
        const bundles = d.bundles || [];
        const dayMap: Record<string, DayData> = {};
        bundles.forEach((b: unknown) => {
          const bb = b as { upload_time?: string; finding_count?: number; ai_name?: string; filename?: string };
          const date = new Date((bb.upload_time ?? '') + ((bb.upload_time ?? '').endsWith('Z') ? '' : 'Z'))
            .toISOString().split('T')[0];
          if (!dayMap[date]) dayMap[date] = { date, count: 0, bundles: [] };
          dayMap[date].count += bb.finding_count || 0;
          dayMap[date].bundles.push(bb.ai_name || bb.filename || '');
        });
        const days: DayData[] = [];
        for (let i = 83; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          days.push(dayMap[dateStr] || { date: dateStr, count: 0, bundles: [] });
        }
        setData(days);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const getColor = (count: number) => {
    if (count === 0) return '#f1f5f9';
    if (count <= 2) return '#fef9c3';
    if (count <= 5) return '#fcd34d';
    if (count <= 10) return '#f59e0b';
    return '#ef4444';
  };

  const weeks: DayData[][] = [];
  for (let i = 0; i < data.length; i += 7) {
    weeks.push(data.slice(i, i + 7));
  }

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (loading) return null;

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px 20px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>Finding Frequency</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Findings across all bundles — last 12 weeks</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#94a3b8' }}>
          <span>Less</span>
          {[0, 2, 5, 10, 15].map(n => (
            <div key={n} style={{ width: '11px', height: '11px', borderRadius: '2px', background: getColor(n) }} />
          ))}
          <span>More</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '3px', position: 'relative' as const }}>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '2px', marginRight: '4px' }}>
          {days.map((d, i) => (
            <div key={d} style={{ height: '11px', fontSize: '9px', color: '#94a3b8', lineHeight: '11px', width: '22px', textAlign: 'right' as const }}>
              {i % 2 === 1 ? d : ''}
            </div>
          ))}
        </div>

        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'flex', flexDirection: 'column' as const, gap: '2px' }}>
            {week.map((day, di) => (
              <div
                key={di}
                onMouseEnter={e => day.count > 0 && setTooltip({ day, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setTooltip(null)}
                style={{
                  width: '11px', height: '11px', borderRadius: '2px',
                  background: getColor(day.count),
                  cursor: day.count > 0 ? 'pointer' : 'default',
                  transition: 'opacity .15s',
                }}
              />
            ))}
          </div>
        ))}
      </div>

      {tooltip && (
        <div style={{
          position: 'fixed' as const, left: tooltip.x + 12, top: tooltip.y - 40,
          background: '#1e293b', color: '#fff', fontSize: '11px', padding: '6px 10px',
          borderRadius: '6px', pointerEvents: 'none', zIndex: 1000, maxWidth: '200px',
        }}>
          <div style={{ fontWeight: 600 }}>{tooltip.day.date}</div>
          <div>{tooltip.day.count} findings · {tooltip.day.bundles.length} bundle{tooltip.day.bundles.length !== 1 ? 's' : ''}</div>
          {tooltip.day.bundles.slice(0, 2).map((b, i) => (
            <div key={i} style={{ color: '#94a3b8', fontSize: '10px' }}>{b}</div>
          ))}
        </div>
      )}
    </div>
  );
}
