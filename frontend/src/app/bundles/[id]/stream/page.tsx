'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import LiveAnalysis from '@/components/LiveAnalysis';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

export default function StreamPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [bundle, setBundle] = useState<{ filename: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`${API}/bundles/${id}`)
      .then(r => r.json())
      .then(b => {
        if (b.status === 'completed') {
          router.push(`/bundles/${id}`);
        } else {
          setBundle(b);
        }
      })
      .catch(() => setBundle(null));
  }, [id, router]);

  if (!bundle) return (
    <div style={{ padding: '40px', textAlign: 'center' as const, color: '#64748b', fontSize: '13px' }}>
      Loading...
    </div>
  );

  return <LiveAnalysis bundleId={id} filename={bundle.filename} />;
}
