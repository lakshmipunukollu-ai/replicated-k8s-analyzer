import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { NavBar } from "@/components/NavBar";
import { RouteGuard } from "@/components/RouteGuard";

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
        <AuthProvider>
          <NavBar />
          <RouteGuard>
            <main className="max-w-5xl mx-auto px-4 py-8">
              {children}
            </main>
          </RouteGuard>
        </AuthProvider>
      </body>
    </html>
  );
}
