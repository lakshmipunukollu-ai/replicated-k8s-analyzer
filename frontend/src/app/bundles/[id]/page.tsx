'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { fetchBundle, fetchReport, triggerAnalysis, Bundle, Report } from '@/lib/api';
import AnalysisProgress from '@/components/AnalysisProgress';
import ReportView from '@/components/ReportView';

export default function BundleDetailPage() {
  const params = useParams();
  const bundleId = params.id as string;

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const b = await fetchBundle(bundleId);
      setBundle(b);
      if (b.status === 'completed') {
        const r = await fetchReport(bundleId);
        setReport(r);
      }
    } catch {
      setError('Failed to load bundle');
    } finally {
      setLoading(false);
    }
  }, [bundleId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAnalyze = async () => {
    try {
      await triggerAnalysis(bundleId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start analysis');
    }
  };

  if (loading) return <div className="text-center py-10 text-gray-500">Loading...</div>;
  if (error) return <div className="text-center py-10 text-red-500">{error}</div>;
  if (!bundle) return <div className="text-center py-10 text-gray-500">Bundle not found</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{bundle.filename}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Status: <span className="capitalize font-medium">{bundle.status}</span>
            {bundle.finding_count > 0 && ` | ${bundle.finding_count} findings`}
          </p>
        </div>
        <div className="flex gap-2">
          {bundle.status === 'uploaded' && (
            <button
              onClick={handleAnalyze}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Start Analysis
            </button>
          )}
          {bundle.status === 'completed' && (
            <Link
              href={`/bundles/${bundleId}/report`}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
            >
              View Full Report
            </Link>
          )}
        </div>
      </div>

      {(bundle.status === 'analyzing' || bundle.status === 'extracting') && (
        <AnalysisProgress
          bundleId={bundleId}
          initialStatus={bundle.status}
          onComplete={loadData}
        />
      )}

      {report && <ReportView report={report} />}
    </div>
  );
}
