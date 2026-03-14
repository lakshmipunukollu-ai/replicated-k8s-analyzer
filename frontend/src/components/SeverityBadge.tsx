'use client';

interface SeverityBadgeProps {
  severity: string;
  className?: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-black',
  low: 'bg-blue-500 text-white',
  info: 'bg-gray-400 text-white',
};

export default function SeverityBadge({ severity, className = '' }: SeverityBadgeProps) {
  const color = SEVERITY_COLORS[severity] || SEVERITY_COLORS.info;
  return (
    <span className={`inline-block px-2 py-1 rounded text-xs font-bold uppercase ${color} ${className}`}>
      {severity}
    </span>
  );
}
