'use client';

import { useState, useCallback } from 'react';
import { uploadBundle, triggerAnalysis } from '@/lib/api';
import { useRouter } from 'next/navigation';

export default function BundleUpload() {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.tar.gz') && !file.name.endsWith('.tgz') && !file.name.endsWith('.gz')) {
      setError('Only .tar.gz files are accepted');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const bundle = await uploadBundle(file);
      await triggerAnalysis(bundle.id);
      router.push(`/bundles/${bundle.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [router]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  return (
    <div className="max-w-lg mx-auto">
      <div
        onDrop={handleDrop}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer
          ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${uploading ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        <div className="text-4xl mb-3">&#128230;</div>
        <p className="text-gray-700 font-medium mb-1">
          {uploading ? 'Uploading...' : 'Drop your support bundle here'}
        </p>
        <p className="text-sm text-gray-500 mb-4">or click to browse (.tar.gz files)</p>
        <input
          type="file"
          accept=".tar.gz,.tgz,.gz"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          className="hidden"
          id="file-upload"
          disabled={uploading}
        />
        <label
          htmlFor="file-upload"
          className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 cursor-pointer"
        >
          {uploading ? 'Uploading...' : 'Select File'}
        </label>
      </div>
      {error && (
        <div className="mt-3 text-red-600 text-sm text-center">{error}</div>
      )}
    </div>
  );
}
