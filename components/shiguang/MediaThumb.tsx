"use client";

import { useEffect, useRef, useState } from "react";
import { Film } from "lucide-react";

/**
 * 图片 / 视频缩略图统一入口
 *
 * 视频原来直接 `<video preload="metadata">`，很多 mp4 只有 moov 在前面才会画首帧，
 * 结果就是「上传完显示空白」。这里等元数据到了主动 seek 到 0.2s 骗一帧出来，
 * 并给播放中/加载中的占位。图片顺手 lazy，长列表滚到哪儿加载到哪儿。
 */
export default function MediaThumb({
  src,
  poster,
  kind,
  alt,
  className = "",
  cover = false,
}: {
  src: string;
  /** 视频首帧封面（后端 ffmpeg 抽好的 jpg），有它就不会只剩黑框 */
  poster?: string | null;
  kind?: "image" | "video" | string;
  alt?: string;
  className?: string;
  /** 首屏大图用 cover=true：不 lazy，优先加载 */
  cover?: boolean;
}) {
  const isVideo = kind === "video" || /\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/i.test(src);
  const ref = useRef<HTMLVideoElement | null>(null);
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !isVideo) return;
    let alive = true;
    const paint = () => {
      if (!alive) return;
      // 只在还没画过的时候挪一下，别打断用户播放
      if (el.currentTime === 0 && el.duration > 0.3) {
        try {
          el.currentTime = 0.2;
        } catch {
          /* 有些编码不让 seek，忽略 */
        }
      }
    };
    const onSeeked = () => {
      if (alive) setPainted(true);
    };
    el.addEventListener("loadeddata", paint);
    el.addEventListener("seeked", onSeeked);
    paint();
    return () => {
      alive = false;
      el.removeEventListener("loadeddata", paint);
      el.removeEventListener("seeked", onSeeked);
    };
  }, [isVideo, src]);

  if (!isVideo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt ?? ""}
        loading={cover ? "eager" : "lazy"}
        decoding="async"
        className={className}
      />
    );
  }

  if (poster) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={poster}
          alt={alt ?? ""}
          loading={cover ? "eager" : "lazy"}
          decoding="async"
          className={className}
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25 text-white/90">
          <Film className="h-5 w-5 drop-shadow" />
        </span>
      </>
    );
  }

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={ref}
        src={src}
        muted
        playsInline
        preload="metadata"
        className={`${className} ${painted ? "" : "bg-slate-900"}`}
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30 text-white/90">
        <Film className="h-5 w-5 drop-shadow" />
      </span>
    </>
  );
}
