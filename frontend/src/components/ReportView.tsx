'use client';

import { Report } from '@/lib/api';
import FindingCard from './FindingCard';
import SeverityBadge from './SeverityBadge';

interface ReportViewProps {
  report: Report;
}

export default function ReportView({ report }: ReportViewProps) {
  const { summary, findings } = report;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm border text-center">
          <div className="text-2xl font-bold text-gray-900">{summary.total_findings}</div>
          <div className="text-xs text-gray-500 mt-1">Total Findings</div>
        </div>
        {summary.analysis_duration_seconds && (
          <div className="bg-white rounded-lg p-4 shadow-sm border text-center">
            <div className="text-2xl font-bold text-gray-900">
              {summary.analysis_duration_seconds.toFixed(1)}s
            </div>
            <div className="text-xs text-gray-500 mt-1">Analysis Duration</div>
          </div>
        )}
      </div>

      {/* Severity breakdown */}
      <div className="bg-white rounded-lg p-4 shadow-sm border">
        <h3 className="text-sm font-semibold text-gray-600 uppercase mb-3">By Severity</h3>
        <div className="flex flex-wrap gap-3">
          {Object.entries(summary.by_severity).map(([severity, count]) => (
            <div key={severity} className="flex items-center gap-2">
              <SeverityBadge severity={severity} />
              <span className="text-sm text-gray-700 font-medium">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Category breakdown */}
      <div className="bg-white rounded-lg p-4 shadow-sm border">
        <h3 className="text-sm font-semibold text-gray-600 uppercase mb-3">By Category</h3>
        <div className="flex flex-wrap gap-3">
          {Object.entries(summary.by_category).map(([category, count]) => (
            <div key={category} className="flex items-center gap-2">
              <span className="text-xs px-2 py-1 bg-gray-100 rounded text-gray-600 capitalize">{category}</span>
              <span className="text-sm text-gray-700 font-medium">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Findings list */}
      <div>
        <h3 className="text-sm font-semibold text-gray-600 uppercase mb-3">
          All Findings ({findings.length})
        </h3>
        <div className="space-y-3">
          {findings.map((finding) => (
            <FindingCard key={finding.id} finding={finding} expanded={true} />
          ))}
        </div>
      </div>
    </div>
  );
}
