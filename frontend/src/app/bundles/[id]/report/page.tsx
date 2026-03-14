'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { fetchBundle, fetchReport, Bundle, Report } from '@/lib/api';
import ReportView from '@/components/ReportView';

export default function ReportPage() {
  const params = useParams();
  const bundleId = params.id as string;

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [b, r] = await Promise.all([
          fetchBundle(bundleId),
          fetchReport(bundleId),
        ]);
        setBundle(b);
        setReport(r);
      } catch {
        setError('Failed to load report');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [bundleId]);

  if (loading) return <div className="text-center py-10 text-gray-500">Loading report...</div>;
  if (error) return <div className="text-center py-10 text-red-500">{error}</div>;
  if (!report || !bundle) return <div className="text-center py-10 text-gray-500">Report not available</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analysis Report</h1>
          <p className="text-sm text-gray-500 mt-1">{bundle.filename}</p>
        </div>
        <Link
          href={`/bundles/${bundleId}`}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
        >
          Back to Bundle
        </Link>
      </div>
      <ReportView report={report} />
    </div>
  );
}
