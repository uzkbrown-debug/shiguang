import type { Metadata } from "next";
import "./globals.css";
import { siteConfig } from "@/siteConfig";

export const metadata: Metadata = {
  title: siteConfig.title,
  description: siteConfig.bio,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
