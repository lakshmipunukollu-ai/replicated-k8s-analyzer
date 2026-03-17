'use client';

import { useState, useEffect, useCallback } from 'react';
import SeverityBadge from './SeverityBadge';
import { Finding } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';
const ANNOTATION_TYPES = ['note', 'action_taken', 'customer_update'] as const;
const EVIDENCE_HIGHLIGHT_KEYWORDS = [
  'OOMKill', 'OOMKilled', 'CrashLoopBackOff', 'ImagePullBackOff',
  'Error', 'Failed', 'Kill', 'Evicted', 'Pressure', 'Pending',
];
const TYPE_STYLE: Record<string, { bg: string; color: string }> = {
  note: { bg: '#f1f5f9', color: '#475569' },
  action_taken: { bg: '#dcfce7', color: '#15803d' },
  customer_update: { bg: '#dbeafe', color: '#1d4ed8' },
};

interface Annotation {
  id: string;
  author: string;
  content: string;
  annotation_type: string;
  created_at: string | null;
}

interface FindingCardProps {
  finding: Finding;
  expanded?: boolean;
  bundleId?: string;
}

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export default function FindingCard({ finding, expanded = false, bundleId: propBundleId }: FindingCardProps) {
  const bundleId = propBundleId || (finding as { bundle_id?: string }).bundle_id;
  const [annotationsOpen, setAnnotationsOpen] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [author, setAuthor] = useState('Support Engineer');
  const [newType, setNewType] = useState<'note' | 'action_taken' | 'customer_update'>('note');
  const [newContent, setNewContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedEvidence, setExpandedEvidence] = useState<Set<number>>(new Set());
  const [evidenceContent, setEvidenceContent] = useState<Record<string, string[]>>({});
  const [evidenceLoading, setEvidenceLoading] = useState<Record<string, boolean>>({});
  const [evidenceError, setEvidenceError] = useState<Record<string, boolean>>({});
  const [evidenceResolvedPath, setEvidenceResolvedPath] = useState<Record<string, string>>({});

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('finding_annotation_author');
      if (saved) setAuthor(saved);
    }
  }, []);

  const loadAnnotations = useCallback(() => {
    if (!bundleId || !finding.id) return;
    setLoading(true);
    fetch(`${API}/bundles/${bundleId}/findings/${finding.id}/annotations`)
      .then((r) => r.json())
      .then((data) => setAnnotations(Array.isArray(data) ? data : []))
      .catch(() => setAnnotations([]))
      .finally(() => setLoading(false));
  }, [bundleId, finding.id]);

  useEffect(() => {
    if (annotationsOpen && bundleId) loadAnnotations();
  }, [annotationsOpen, bundleId, loadAnnotations]);

  const handleSaveNote = () => {
    if (!newContent.trim() || !bundleId || !finding.id) return;
    setSaving(true);
    const body = { author, content: newContent.trim(), annotation_type: newType };
    fetch(`${API}/bundles/${bundleId}/findings/${finding.id}/annotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then((r) => r.json())
      .then((ann) => {
        setAnnotations((prev) => [...prev, { ...ann, created_at: ann.created_at || null }]);
        setNewContent('');
        if (typeof window !== 'undefined') localStorage.setItem('finding_annotation_author', author);
      })
      .catch(() => {})
      .finally(() => setSaving(false));
  };

  const handleDelete = (annotationId: string) => {
    fetch(`${API}/annotations/${annotationId}`, { method: 'DELETE' })
      .then(() => setAnnotations((prev) => prev.filter((a) => a.id !== annotationId)))
      .catch(() => {});
  };

  const onEvidenceClick = (index: number, path: string) => {
    if (!path) return;
    setExpandedEvidence((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
    if (evidenceContent[path] !== undefined) return;
    setEvidenceLoading((prev) => ({ ...prev, [path]: true }));
    setEvidenceError((prev) => ({ ...prev, [path]: false }));
    fetch(`${API}/bundles/${bundleId}/evidence?path=${encodeURIComponent(path)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setEvidenceError((prev) => ({ ...prev, [path]: true }));
          setEvidenceContent((prev) => ({ ...prev, [path]: [] }));
        } else {
          setEvidenceContent((prev) => ({ ...prev, [path]: d.lines || [] }));
          if (d.path) setEvidenceResolvedPath((prev) => ({ ...prev, [path]: d.path }));
        }
      })
      .catch(() => {
        setEvidenceError((prev) => ({ ...prev, [path]: true }));
        setEvidenceContent((prev) => ({ ...prev, [path]: [] }));
      })
      .finally(() => setEvidenceLoading((prev) => ({ ...prev, [path]: false })));
  };

  const highlightLine = (line: string) => {
    let rest = line;
    const parts: React.ReactNode[] = [];
    const re = new RegExp(EVIDENCE_HIGHLIGHT_KEYWORDS.join('|'), 'gi');
    let m: RegExpExecArray | null;
    let lastIdx = 0;
    while ((m = re.exec(line)) !== null) {
      parts.push(rest.slice(lastIdx, m.index));
      parts.push(<span key={m.index} className="text-red-400 font-semibold">{m[0]}</span>);
      lastIdx = re.lastIndex;
    }
    parts.push(rest.slice(lastIdx));
    return parts;
  };

  const annotationCount = annotations.length;

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
          {Math.round((finding.confidence ?? 0) * 100)}% confidence
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
              <div className="space-y-0">
                {finding.evidence.map((ev, i) => {
                  const path = (ev as { source?: string }).source ?? `evidence-${i}`;
                  const isPathClickable = !!path && path !== `evidence-${i}` && !!bundleId;
                  const isExpanded = expandedEvidence.has(i);
                  return (
                    <div key={i}>
                      <div
                        role={isPathClickable ? 'button' : undefined}
                        onClick={() => isPathClickable && onEvidenceClick(i, path)}
                        className={`rounded px-2 py-1.5 text-xs font-mono flex items-center gap-2 ${isPathClickable ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                      >
                        <span className="text-gray-400 flex-shrink-0 w-4">
                          {isPathClickable ? (isExpanded ? '▼' : '▶') : ''}
                        </span>
                        <span className="text-gray-500 truncate">{path}{ev.line != null ? `:${ev.line}` : ''}</span>
                        {!isPathClickable && (ev as { content?: string }).content && (
                          <span className="text-gray-800 truncate">{(ev as { content?: string }).content}</span>
                        )}
                      </div>
                      {isPathClickable && isExpanded && (
                        <div className="ml-6 mt-1 mb-2 border border-gray-700 rounded-md overflow-hidden max-h-[300px] overflow-y-auto bg-gray-900">
                          {evidenceLoading[path] && (
                            <div className="p-3 text-gray-400 text-xs">Loading...</div>
                          )}
                          {evidenceError[path] && !evidenceLoading[path] && (
                            <div className="p-3 text-gray-400 text-xs">Could not load file.</div>
                          )}
                          {!evidenceError[path] && (evidenceContent[path]?.filter(l => l.trim()).length === 0) && !evidenceLoading[path] && (
                            <div className="flex items-start gap-2 p-3 bg-amber-950 border border-amber-700 text-amber-200 text-xs rounded-b-md">
                              <span className="flex-shrink-0">⚠️</span>
                              <span>Container terminated before writing logs — expected for OOMKilled pods. The kill event is recorded in Kubernetes events.</span>
                            </div>
                          )}
                          {!evidenceLoading[path] && !evidenceError[path] && (evidenceContent[path]?.filter(l => l.trim()).length ?? 0) > 0 && (
                            <>
                              <div className="bg-gray-800 text-gray-400 text-xs px-3 py-1 border-b border-gray-700">
                                {(evidenceResolvedPath[path] || path).split('/').filter(Boolean).pop() || path}
                              </div>
                              <pre className="p-3 text-xs font-mono whitespace-pre">
                                {evidenceContent[path].map((line, lineIdx) => (
                                  <div key={lineIdx} className="flex">
                                    <span className="text-gray-500 select-none w-8 flex-shrink-0 pr-2 text-right">{lineIdx + 1}</span>
                                    <span className="flex-1 text-gray-100">{highlightLine(line)}</span>
                                  </div>
                                ))}
                              </pre>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {bundleId && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setAnnotationsOpen((o) => !o)}
                className="text-xs font-semibold text-gray-600 hover:text-gray-900"
              >
                Notes ({annotationCount})
              </button>
              {annotationsOpen && (
                <div className="mt-3 space-y-3">
                  {loading ? (
                    <p className="text-xs text-gray-500">Loading notes...</p>
                  ) : (
                    <>
                      {annotations.map((ann) => {
                        const style = TYPE_STYLE[ann.annotation_type] || TYPE_STYLE.note;
                        return (
                          <div
                            key={ann.id}
                            className="group relative rounded p-3 bg-gray-50 border border-gray-100"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-gray-900 text-xs">{ann.author}</span>
                              <span className="text-xs text-gray-500">{relativeTime(ann.created_at)}</span>
                              <span
                                className="text-xs px-1.5 py-0.5 rounded"
                                style={{ background: style.bg, color: style.color }}
                              >
                                {ann.annotation_type.replace('_', ' ')}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDelete(ann.id)}
                                className="ml-auto opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 text-sm"
                              >
                                ×
                              </button>
                            </div>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{ann.content}</p>
                          </div>
                        );
                      })}
                      <div className="rounded border border-gray-200 p-3 bg-white">
                        <div className="flex gap-2 mb-2">
                          <input
                            type="text"
                            value={author}
                            onChange={(e) => setAuthor(e.target.value)}
                            placeholder="Author"
                            className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5"
                          />
                          <select
                            value={newType}
                            onChange={(e) => setNewType(e.target.value as typeof newType)}
                            className="text-xs border border-gray-200 rounded px-2 py-1.5"
                          >
                            {ANNOTATION_TYPES.map((t) => (
                              <option key={t} value={t}>{t.replace('_', ' ')}</option>
                            ))}
                          </select>
                        </div>
                        <textarea
                          value={newContent}
                          onChange={(e) => setNewContent(e.target.value)}
                          placeholder="Add a note..."
                          rows={2}
                          className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 mb-2 resize-y"
                        />
                        <button
                          type="button"
                          onClick={handleSaveNote}
                          disabled={saving || !newContent.trim()}
                          className="text-xs font-semibold px-3 py-1.5 rounded bg-gray-800 text-white hover:bg-gray-700 disabled:opacity-50"
                        >
                          {saving ? 'Saving...' : 'Save Note'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
