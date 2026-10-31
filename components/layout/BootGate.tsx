"use client";

import { useEffect, useLayoutEffect, useState } from "react";

// 服务端没有 window，用 useEffect 顶替，避免 SSR 时 useLayoutEffect 告警
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * 开场动画期间干脆不挂载站点。
 *
 * 只靠 CSS 隐藏是没用的：看板娘、动效、数据请求的 JS 照跑不误，主线程一样被抢。
 * 这里在 layout effect（绘制前）里判断，一旦开场屏在，立刻把子树卸掉——
 * 子组件的 useEffect 还没来得及执行，所以既不会发请求也不会有可见闪烁。
 */
export default function BootGate({ children }: { children: React.ReactNode }) {
  const [blocked, setBlocked] = useState(false);

  useIsoLayoutEffect(() => {
    const root = document.documentElement;
    const sync = () => setBlocked(root.dataset.boot === "1");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-boot"] });

    // 兜底：开场动画被打断（切后台、快速点两次、系统动效设置）时，
    // 页面可能停在「半透明 / 缩放」的中间态。切回前台或页面恢复时强制收干净，
    // 免得用户看到一张发白、被压窄的首页。
    const repair = () => {
      if (root.dataset.boot === "1") return;
      const main = document.querySelector("main");
      for (const el of [document.body, main]) {
        if (!el) continue;
        el.style.removeProperty("transform");
        el.style.removeProperty("opacity");
        el.style.removeProperty("filter");
        el.style.removeProperty("zoom");
      }
      // 触发一次重排，让浏览器丢掉中间态
      void document.body.offsetHeight;
    };
    window.addEventListener("pageshow", repair);
    document.addEventListener("visibilitychange", repair);
    return () => {
      observer.disconnect();
      window.removeEventListener("pageshow", repair);
      document.removeEventListener("visibilitychange", repair);
    };
  }, []);

  if (blocked) return null;
  return <>{children}</>;
}
