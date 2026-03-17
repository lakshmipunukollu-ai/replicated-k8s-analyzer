'use client';
import { useState, useRef, useEffect } from 'react';

interface Message { role: 'user' | 'ai'; text: string; }

export default function BundleChat({ bundleId }: { bundleId: string }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', text: 'Ask me anything about this bundle — what caused an issue, whether findings are related, or what to investigate next.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const question = input.trim();
    setInput('');
    setMessages(m => [...m, { role: 'user', text: question }]);
    setLoading(true);
    try {
      const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
      const res = await fetch(`${API}/bundles/${bundleId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      setMessages(m => [...m, { role: 'ai', text: data.answer }]);
    } catch {
      setMessages(m => [...m, { role: 'ai', text: 'Failed to get answer. Please try again.' }]);
    } finally { setLoading(false); }
  };

  const SUGGESTIONS = ['What caused the OOMKill?', 'Are these findings related?', 'What should I fix first?', 'Is this a cascading failure?'];

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>Ask AI about this bundle</div>
        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Answers are grounded in the actual bundle data</div>
      </div>
      <div style={{ height: '280px', overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', gap: '8px', alignItems: 'flex-start' }}>
            {m.role === 'ai' && (
              <div style={{ width: '24px', height: '24px', background: '#eff6ff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#1d4ed8', flexShrink: 0, marginTop: '2px' }}>AI</div>
            )}
            <div style={{
              maxWidth: '78%', fontSize: '13px', lineHeight: '1.5', padding: '9px 13px', borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '2px 12px 12px 12px',
              background: m.role === 'user' ? '#1e3a5f' : '#f8fafc',
              color: m.role === 'user' ? '#f1f5f9' : '#374151',
              border: m.role === 'ai' ? '0.5px solid #e2e8f0' : 'none',
            }}>
              {m.role === 'ai' ? (
                <div dangerouslySetInnerHTML={{ __html: m.text
                  .replace(/\*\*\*(.*?)\*\*\*/g, '<strong>$1</strong>')
                  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                  .replace(/\*(.*?)\*/g, '<em>$1</em>')
                  .replace(/\n/g, '<br/>')
                }} />
              ) : (
                m.text
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ width: '24px', height: '24px', background: '#eff6ff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#1d4ed8' }}>AI</div>
            <div style={{ fontSize: '13px', color: '#94a3b8' }}>Analyzing bundle...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: '8px 12px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '6px', flexWrap: 'wrap' as const }}>
        {SUGGESTIONS.map(s => (
          <button key={s} onClick={() => setInput(s)} style={{ fontSize: '11px', padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: '20px', background: '#fff', color: '#475569', cursor: 'pointer' }}>{s}</button>
        ))}
      </div>
      <div style={{ padding: '10px 14px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '8px' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Ask about this bundle..."
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none' }}
        />
        <button onClick={send} disabled={loading} style={{ padding: '8px 18px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
          Ask
        </button>
      </div>
    </div>
  );
}
