import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import AppShell from "@/components/AppShell";
import "./globals.css";

const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "핫플비서",
  description: "SNS에서 본 핫플을 모아 두고, 약속이 생기면 딱 맞는 곳을 추천해 주는 비서",
};

export const viewport: Viewport = {
  themeColor: "#111317",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${jetbrains.variable} h-full antialiased`}>
      <head>
        {/* Pretendard: Korean typeface drawn to match Inter, Railway's UI font */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
