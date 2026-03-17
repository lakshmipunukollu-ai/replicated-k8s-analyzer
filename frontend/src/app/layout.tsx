import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "K8s Bundle Analyzer",
  description: "AI-powered Kubernetes support bundle analysis tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 min-h-screen`}>
        <nav className="bg-white border-b shadow-sm">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <Link href="/" className="font-bold text-lg text-gray-900">
              K8s Bundle Analyzer
            </Link>
            <div className="flex gap-4 text-sm">
              <Link href="/" className="text-gray-600 hover:text-gray-900">Upload</Link>
              <Link href="/bundles" className="text-gray-600 hover:text-gray-900">Dashboard</Link>
              <Link href="/search" style={{ color: '#475569', fontSize: '14px', textDecoration: 'none' }}>Search</Link>
              <Link href="/patterns" style={{ color: '#475569', fontSize: '14px', textDecoration: 'none' }}>Patterns</Link>
              <Link href="/companies" style={{ color: '#475569', fontSize: '14px', textDecoration: 'none' }}>Companies</Link>
              <Link href="/triage" style={{ color: '#475569', fontSize: '14px', textDecoration: 'none' }}>Triage</Link>
              <Link href="/alerts" style={{ color: '#475569', fontSize: '14px', textDecoration: 'none' }}>Alerts</Link>
              <Link href="/suppression" style={{ color: '#475569', fontSize: '14px', textDecoration: 'none' }}>Suppression</Link>
            </div>
          </div>
        </nav>
        <main className="max-w-5xl mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
