"use client";

import { useEffect, useState } from "react";
import { useBackground } from "@/components/providers/BackgroundProvider";
import { siteConfig } from "@/siteConfig";

export default function BackgroundRenderer() {
  const { bgImage, bgBlur } = useBackground();
  const videos = siteConfig.bgVideos ?? [];
  const [videoIndex, setVideoIndex] = useState(0);
  const [videoFailed, setVideoFailed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // 预先在离屏 canvas 里把小图糊好，页面就只是一张静态图，不用每帧跑滤镜
  const [blurredSrc, setBlurredSrc] = useState("");

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // 配了多个视频时轮换播放
  useEffect(() => {
    if (videos.length <= 1) return;
    const timer = setInterval(() => setVideoIndex((i) => (i + 1) % videos.length), 30000);
    return () => clearInterval(timer);
  }, [videos.length]);

  const src = bgImage || siteConfig.bgImages[0];

  // 用 480px 的小图画一次模糊存成图片：放全屏时跟实时滤镜看不出差别，
  // 但省掉了整屏每帧一次的滤镜合成（实测能省 4ms/帧）
  useEffect(() => {
    if (bgBlur <= 0 || !src) {
      setBlurredSrc("");
      return;
    }
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      const w = 480;
      const h = Math.max(1, Math.round((img.height / img.width) * w));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      // 缩了 4 倍多，模糊半径也按比例缩，放大后效果一致
      const scale = w / (img.width || w);
      ctx.filter = `blur(${Math.max(0.6, bgBlur * scale)}px)`;
      ctx.drawImage(img, 0, 0, w, h);
      try {
        setBlurredSrc(canvas.toDataURL("image/jpeg", 0.82));
      } catch {
        setBlurredSrc("");
      }
    };
    img.onerror = () => alive && setBlurredSrc("");
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src, bgBlur]);

  const showVideo = videos.length > 0 && !videoFailed && !isMobile;
  // 图片背景优先用预先糊好的那张；还没准备好（或背景是视频）时才退回实时滤镜
  const imageBlurStyle =
    blurredSrc || bgBlur <= 0
      ? undefined
      : { filter: `blur(${bgBlur}px)`, transform: "scale(1.05)", transformOrigin: "center" };
  const videoBlurStyle =
    bgBlur > 0
      ? { filter: `blur(${Math.min(bgBlur, 14)}px)`, transform: "scale(1.05)", transformOrigin: "center" }
      : undefined;

  return (
    <div className="fixed inset-0 -z-10 h-lvh">
      {siteConfig.useGradient ? (
        <div
          className="absolute inset-0 gradient-background"
          style={{
            backgroundImage: `linear-gradient(135deg, ${siteConfig.themeColors.join(", ")})`,
          }}
        />
      ) : (
        <>
          {showVideo ? (
            <video
              key={videos[videoIndex]}
              className="absolute inset-0 w-full h-full object-cover"
              style={videoBlurStyle}
              src={videos[videoIndex]}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              onError={() => setVideoFailed(true)}
            />
          ) : (
            <div
              className="absolute inset-0 bg-cover bg-center bg-no-repeat"
              style={{
                backgroundImage: `url(${blurredSrc || src})`,
                ...imageBlurStyle,
              }}
            />
          )}
          {/* 深色模式遮罩（保留背景可见度） */}
          <div className="absolute inset-0 bg-transparent dark:bg-black/45 transition-colors duration-500" />
        </>
      )}
    </div>
  );
}
