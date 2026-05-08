import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Sidebar } from "@/components/layout/Sidebar";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["300", "400", "500"] });

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
    <html lang="ko" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} app-body`}>
        <Sidebar />
        <main className="app-main">
          {children}
        </main>
      </body>
    </html>
  );
}
