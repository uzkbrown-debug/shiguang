"use client";

import { useEffect } from "react";

/**
 * 站点级「预加载」：把首屏之后大概率要用到的东西，趁空闲提前备好
 *
 * 这台服务器只有 2 核 2G，所以策略是「少量、低优先级、可取消」：
 * 1. 浏览器空闲时预取几个轻接口（我是谁 / 年份 / 常用列表），点到对应页面就直出；
 * 2. 预取首屏可能要用的图片（上一段记忆的封面），滚到 gallery 不再等；
 * 3. 视频只预热元数据（preload=metadata），绝不整段下载。
 *
 * 不做的事：不预加载大视频、不并发十几个请求、无痕模式/省流时直接跳过。
 */
const WARM_APIS = [
  "/api/auth/me",
  "/api/timeline/years",
  "/api/memories?limit=12",
  "/api/guides?scope=all",
];

function idle(cb: () => void, timeout = 2000) {
  const w = window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  if (typeof w.requestIdleCallback === "function") {
    w.requestIdleCallback(cb, { timeout });
  } else {
    window.setTimeout(cb, 400);
  }
}

export default function Preload() {
  useEffect(() => {
    // 省流模式就别预取了
    const conn = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } })
      .connection;
    if (conn?.saveData) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      idle(() => {
        if (cancelled) return;
        // 低优先级预取：拿到就丢进 HTTP 缓存，页面再请求同一 URL 会直接命中
        WARM_APIS.forEach((url, i) => {
          window.setTimeout(() => {
            if (cancelled) return;
            fetch(url, { cache: "force-cache", priority: "low" } as RequestInit).catch(() => {});
          }, i * 120);
        });

        // 首屏之外的封面图，用 <link rel=prefetch> 让浏览器自己排优先级
        fetch("/api/memories?limit=6", { cache: "force-cache" })
          .then((r) => (r.ok ? r.json() : []))
          .then((rows: { cover?: string | null }[]) => {
            if (cancelled || !Array.isArray(rows)) return;
            rows
              .map((r) => r.cover)
              .filter((u): u is string => Boolean(u))
              .slice(0, 6)
              .forEach((href) => {
                const link = document.createElement("link");
                link.rel = "prefetch";
                link.as = "image";
                link.href = href;
                document.head.appendChild(link);
              });
          })
          .catch(() => {});
      });
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}
