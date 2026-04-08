import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Sidebar } from "@/components/layout/Sidebar";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "E-able | 웹접근성 진단",
  description: "이트라이브 웹접근성 자동 진단 도구",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={inter.variable} style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f6f8fa' }}>
        <Sidebar />
        <main style={{ marginLeft: '220px', flex: 1, overflowX: 'hidden', minHeight: '100vh' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
