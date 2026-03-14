const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

export interface Bundle {
  id: string;
  filename: string;
  file_size: number;
  status: string;
  upload_time: string;
  analysis_start?: string | null;
  analysis_end?: string | null;
  error_message?: string | null;
  finding_count: number;
}

export interface Finding {
  id: string;
  bundle_id: string;
  severity: string;
  category: string;
  title: string;
  summary?: string;
  root_cause?: string;
  impact?: string;
  confidence: number;
  source: string;
  recommended_actions: string[];
  related_findings: string[];
  evidence: { type: string; source: string; content: string; line?: number }[];
}

export interface ReportSummary {
  total_findings: number;
  by_severity: Record<string, number>;
  by_category: Record<string, number>;
  analysis_duration_seconds?: number;
}

export interface Report {
  bundle_id: string;
  status: string;
  summary: ReportSummary;
  findings: Finding[];
}

export interface SSEEvent {
  event_type: string;
  data: Record<string, unknown>;
}

export async function fetchBundles(): Promise<Bundle[]> {
  const res = await fetch(`${API_BASE}/bundles`);
  if (!res.ok) throw new Error('Failed to fetch bundles');
  const data = await res.json();
  return data.bundles;
}

export async function fetchBundle(id: string): Promise<Bundle> {
  const res = await fetch(`${API_BASE}/bundles/${id}`);
  if (!res.ok) throw new Error('Failed to fetch bundle');
  return res.json();
}

export async function fetchReport(id: string): Promise<Report> {
  const res = await fetch(`${API_BASE}/bundles/${id}/report`);
  if (!res.ok) throw new Error('Failed to fetch report');
  return res.json();
}

export async function uploadBundle(file: File): Promise<Bundle> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE}/bundles/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(err.detail || 'Upload failed');
  }
  return res.json();
}

export async function triggerAnalysis(id: string): Promise<{ bundle_id: string; status: string; message: string }> {
  const res = await fetch(`${API_BASE}/bundles/${id}/analyze`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to start analysis');
  return res.json();
}

export function streamStatus(bundleId: string, onEvent: (event: SSEEvent) => void): () => void {
  const eventSource = new EventSource(`${API_BASE}/bundles/${bundleId}/status`);

  const handleEvent = (type: string) => (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data);
      onEvent({ event_type: type, data });
    } catch {
      // ignore parse errors
    }
  };

  eventSource.addEventListener('progress', handleEvent('progress'));
  eventSource.addEventListener('finding', handleEvent('finding'));
  eventSource.addEventListener('error', handleEvent('error'));
  eventSource.addEventListener('complete', handleEvent('complete'));

  eventSource.onerror = () => {
    eventSource.close();
  };

  return () => eventSource.close();
}
