import type { Metadata, Viewport } from "next";
import AppShell from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "핫플비서",
  description: "SNS에서 본 핫플을 모아 두고, 약속이 생기면 딱 맞는 곳을 추천해 주는 비서",
};

export const viewport: Viewport = {
  themeColor: "#ff5a36",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
