'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';
const API_COMPANIES = `${API}/companies`;

interface Company { id: string; name: string; slug: string; tier: string; project_count: number; bundle_count: number; avg_health_score: number | null; }
interface Project { id: string; name: string; app_version: string | null; bundle_count: number; last_bundle_date: string | null; }

export default function BundleUpload() {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{ bundleId: string; newBundleId: string } | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string>('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>('');
  const [appVersion, setAppVersion] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetch(API_COMPANIES)
      .then((r) => r.json())
      .then((data) => setCompanies(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setProjectId('');
    if (!companyId) {
      setProjects([]);
      return;
    }
    fetch(`${API}/companies/${companyId}`)
      .then((r) => r.json())
      .then((data) => setProjects(data?.projects || []))
      .catch(() => setProjects([]));
  }, [companyId]);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.tar.gz') && !file.name.endsWith('.tgz') && !file.name.endsWith('.gz')) {
      setError('Only .tar.gz files are accepted');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (companyId) formData.append('company_id', companyId);
      if (projectId) formData.append('project_id', projectId);
      if (appVersion.trim()) formData.append('app_version', appVersion.trim());
      const res = await fetch(`${API}/bundles/upload`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();

      if (data.is_duplicate && data.duplicate_of) {
        setUploading(false);
        setDuplicateWarning({ bundleId: data.duplicate_of, newBundleId: data.id });
        return;
      }

      const bundleId = data.id;
      await fetch(`${API}/bundles/${bundleId}/analyze`, { method: 'POST' }).catch(() => {});
      router.push(`/bundles/${bundleId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setUploading(false);
    }
  }, [router, companyId, projectId, appVersion]);

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
      <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '360px', marginLeft: 'auto', marginRight: 'auto' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Company</label>
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', background: '#fff', color: '#1e293b' }}
          >
            <option value="">— None —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>Project</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            disabled={!companyId}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', background: '#fff', color: '#1e293b' }}
          >
            <option value="">— None —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>App Version</label>
          <input
            type="text"
            value={appVersion}
            onChange={(e) => setAppVersion(e.target.value)}
            placeholder="e.g. v2.1.4"
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', color: '#1e293b', boxSizing: 'border-box' }}
          />
        </div>
      </div>
      {error && (
        <div className="mt-3 text-red-600 text-sm text-center">{error}</div>
      )}
      {duplicateWarning && (
        <div style={{ marginTop: '16px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '14px 18px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#92400e', marginBottom: '6px' }}>⚠ Possible duplicate detected</div>
          <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '12px' }}>A bundle with the same filename was uploaded recently.</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={async () => {
                await fetch(`${API}/bundles/${duplicateWarning.newBundleId}/analyze`, { method: 'POST' }).catch(() => {});
                router.push(`/bundles/${duplicateWarning.newBundleId}`);
              }}
              style={{ padding: '7px 14px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
            >
              Analyze anyway
            </button>
            <button
              onClick={() => router.push(`/bundles/${duplicateWarning.bundleId}`)}
              style={{ padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
            >
              View existing
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
