'use client';

import { useEffect, useState, useRef } from 'react';
import { streamStatus, SSEEvent, Finding } from '@/lib/api';
import FindingCard from './FindingCard';

interface AnalysisProgressProps {
  bundleId: string;
  initialStatus: string;
  onComplete?: () => void;
}

interface ProgressState {
  step: string;
  progress: number;
  message: string;
}

export default function AnalysisProgress({ bundleId, initialStatus, onComplete }: AnalysisProgressProps) {
  const [progress, setProgress] = useState<ProgressState>({
    step: 'waiting',
    progress: 0,
    message: 'Waiting for analysis to start...',
  });
  const [findings, setFindings] = useState<Finding[]>([]);
  const [completed, setCompleted] = useState(initialStatus === 'completed');
  const [error, setError] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (initialStatus === 'completed' || initialStatus === 'uploaded') return;

    const cleanup = streamStatus(bundleId, (event: SSEEvent) => {
      switch (event.event_type) {
        case 'progress':
          setProgress({
            step: (event.data.step as string) || '',
            progress: (event.data.progress as number) || 0,
            message: (event.data.message as string) || '',
          });
          break;
        case 'finding':
          setFindings((prev) => [...prev, event.data as unknown as Finding]);
          break;
        case 'complete':
          setCompleted(true);
          onComplete?.();
          break;
        case 'error':
          setError((event.data.message as string) || 'Analysis failed');
          break;
      }
    });

    cleanupRef.current = cleanup;
    return () => cleanup();
  }, [bundleId, initialStatus, onComplete]);

  if (initialStatus === 'completed') return null;
  if (initialStatus === 'uploaded') return null;

  return (
    <div className="space-y-4">
      {!completed && !error && (
        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-700 font-medium">{progress.message}</span>
            <span className="text-gray-500">{progress.progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progress.progress}%` }}
            />
          </div>
        </div>
      )}

      {completed && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800 text-sm">
          Analysis complete. {findings.length > 0 ? `Found ${findings.length} issues.` : ''}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">
          {error}
        </div>
      )}

      {findings.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-600 uppercase">Live Findings</h3>
          {findings.map((f, i) => (
            <FindingCard key={f.id || i} finding={f} />
          ))}
        </div>
      )}
    </div>
  );
}
