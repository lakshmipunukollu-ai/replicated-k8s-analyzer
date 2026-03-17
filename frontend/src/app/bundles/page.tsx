import BundleList from '@/components/BundleList';
import BundleComparison from '@/components/BundleComparison';

export default function BundlesPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Diagnostics Dashboard</h1>
      </div>
      <BundleList />
      <div className="mt-8">
        <BundleComparison />
      </div>
    </div>
  );
}
