import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Serif_SC } from "next/font/google";
import "./globals.css";
import "highlight.js/styles/vs2015.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { BackgroundProvider } from "@/components/providers/BackgroundProvider";
import { MusicProvider } from "@/components/providers/MusicProvider";
import { EffectProvider } from "@/components/providers/EffectProvider";
import BackgroundRenderer from "@/components/layout/BackgroundRenderer";
import Navbar from "@/components/layout/Navbar";
import ClientWidgets from "@/components/layout/ClientWidgets";
import ClickEffect from "@/components/ui/ClickEffect";
import RadialMenu from "@/components/ui/RadialMenu";
import MouseTrail from "@/components/ui/MouseTrail";
import SeasonalEffect from "@/components/ui/SeasonalEffect";
import KiraSparkle from "@/components/ui/KiraSparkle";
import WelcomeScreen from "@/components/layout/WelcomeScreen";
import BootGate from "@/components/layout/BootGate";
import VisitorTracker from "@/components/layout/VisitorTracker";
import XiaoshiAI from "@/components/shiguang/XiaoshiAI";
import UserAvatar from "@/components/shiguang/UserAvatar";
import DevToolsTranslator from "@/components/shiguang/DevToolsTranslator";
import { siteConfig } from "@/siteConfig";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSerifSC = Noto_Serif_SC({
  variable: "--font-noto-serif-sc",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: siteConfig.title,
  description: siteConfig.bio,
  alternates: {
    types: {
      "application/rss+xml": "/feed",
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} ${notoSerifSC.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans">
        {/* 在首次绘制前就决定要不要播开场动画，并立刻用高优先级预取那段短片：
            不然短片会和 dev 模式下一大堆模块请求抢连接，边下边播就会一顿一顿 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              `try{` +
              `var K='shiguang_boot',C='shiguang_clip',s=location.search;` +
              `var clips=['/videos/boot/boot-1.mp4?v=3','/videos/boot/boot-2.mp4?v=3','/videos/boot/boot-3.mp4?v=3'];` +
              `if(s.indexOf('boot=0')>-1)localStorage.setItem(K,'off');` +
              `if(s.indexOf('boot=1')>-1)localStorage.setItem(K,'on');` +
              `if(localStorage.getItem(K)!=='off'&&(s.indexOf('nw=1')>-1||!sessionStorage.getItem('shiguang-boot-shown'))){` +
              `var c=clips[0];sessionStorage.setItem(C,c);` +
              `var r=document.documentElement;r.dataset.boot='1';r.dataset.clip=c;sessionStorage.setItem('shiguang-boot-shown','1');` +
              `var l=document.createElement('link');l.rel='preload';l.as='video';l.href=c;l.fetchPriority='high';document.head.appendChild(l);` +
              `}}catch(e){}`,
          }}
        />
        <ThemeProvider>
          <EffectProvider>
            <WelcomeScreen />
            <BootGate>
              <BackgroundProvider>
                <MusicProvider>
                  <ToastProvider>
                    <BackgroundRenderer />
                    <VisitorTracker />
                    <ClickEffect />
                    <RadialMenu />
                    <MouseTrail />
                    <SeasonalEffect />
                    <KiraSparkle />
                    <ClientWidgets />
                    <XiaoshiAI />
                    <UserAvatar />
                    <Navbar />
                    <main className="flex-1 pt-16">
                      {children}
                    </main>
                    <DevToolsTranslator />
                  </ToastProvider>
                </MusicProvider>
              </BackgroundProvider>
            </BootGate>
          </EffectProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
