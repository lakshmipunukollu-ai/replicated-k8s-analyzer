'use client';

import SeverityBadge from './SeverityBadge';
import { Finding } from '@/lib/api';

interface FindingCardProps {
  finding: Finding;
  expanded?: boolean;
}

export default function FindingCard({ finding, expanded = false }: FindingCardProps) {
  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <SeverityBadge severity={finding.severity} />
            <span className="text-xs px-2 py-0.5 bg-gray-100 rounded text-gray-600 capitalize">
              {finding.category}
            </span>
            <span className="text-xs px-2 py-0.5 bg-gray-100 rounded text-gray-600">
              {finding.source === 'pattern_match' ? 'Pattern' : finding.source === 'llm_analysis' ? 'AI' : 'Correlation'}
            </span>
          </div>
          <h3 className="font-semibold text-gray-900 text-sm">{finding.title}</h3>
          {finding.summary && (
            <p className="text-sm text-gray-600 mt-1">{finding.summary}</p>
          )}
        </div>
        <div className="text-right text-xs text-gray-500">
          {Math.round(finding.confidence * 100)}% confidence
        </div>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3 border-t pt-3">
          {finding.root_cause && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Root Cause</h4>
              <p className="text-sm text-gray-700">{finding.root_cause}</p>
            </div>
          )}
          {finding.impact && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Impact</h4>
              <p className="text-sm text-gray-700">{finding.impact}</p>
            </div>
          )}
          {finding.recommended_actions?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Recommended Actions</h4>
              <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                {finding.recommended_actions.map((action, i) => (
                  <li key={i}>{action}</li>
                ))}
              </ul>
            </div>
          )}
          {finding.evidence?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Evidence</h4>
              <div className="space-y-1">
                {finding.evidence.map((ev, i) => (
                  <div key={i} className="bg-gray-50 rounded p-2 text-xs font-mono">
                    <span className="text-gray-500">{ev.source}{ev.line ? `:${ev.line}` : ''}:</span>{' '}
                    <span className="text-gray-800">{ev.content}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
