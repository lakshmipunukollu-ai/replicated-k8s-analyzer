import BundleUpload from '@/components/BundleUpload';

export default function Home() {
  return (
    <div className="py-10">
      <h1 className="text-3xl font-bold text-center text-gray-900 mb-2">
        Kubernetes Support Bundle Analyzer
      </h1>
      <p className="text-center text-gray-600 mb-10 max-w-xl mx-auto">
        Upload a Troubleshoot support bundle (.tar.gz) to analyze it for known failure patterns
        and get AI-powered insights into your cluster health.
      </p>
      <BundleUpload />
    </div>
  );
}
