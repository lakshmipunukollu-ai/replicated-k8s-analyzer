'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchBundles, Bundle } from '@/lib/api';

const STATUS_COLORS: Record<string, string> = {
  uploaded: 'bg-gray-100 text-gray-700',
  extracting: 'bg-blue-100 text-blue-700',
  analyzing: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

function formatTime(ts: string) {
  return new Date(ts).toLocaleString();
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BundleList() {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchBundles();
        setBundles(data);
      } catch {
        setError('Failed to load bundles');
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="text-center py-10 text-gray-500">Loading bundles...</div>;
  if (error) return <div className="text-center py-10 text-red-500">{error}</div>;
  if (bundles.length === 0) return <div className="text-center py-10 text-gray-500">No bundles uploaded yet</div>;

  return (
    <div className="space-y-3">
      {bundles.map((bundle) => (
        <Link
          key={bundle.id}
          href={`/bundles/${bundle.id}`}
          className="block border rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">{bundle.filename}</h3>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                <span>{formatSize(bundle.file_size)}</span>
                <span>{formatTime(bundle.upload_time)}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {bundle.finding_count > 0 && (
                <span className="bg-purple-100 text-purple-700 text-xs font-medium px-2 py-1 rounded">
                  {bundle.finding_count} findings
                </span>
              )}
              <span className={`text-xs font-medium px-2 py-1 rounded capitalize ${STATUS_COLORS[bundle.status] || STATUS_COLORS.uploaded}`}>
                {bundle.status}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
