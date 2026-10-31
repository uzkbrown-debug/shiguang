"use client";

// 会话体检：cookie 有但令牌过期（比如换过账号、后端重装过）时，
// 中间件是看不出来的（它在 Edge 里读不到数据库）。没有这一层，
// 页面会一路放行但所有接口 401，用户看到的就是「网站是空的」。

import { useEffect } from "react";

export default function SessionGuard() {
  useEffect(() => {
    // 登录页自己会处理，别在这里插一脚 —— 否则无效 cookie 会两头弹成死循环
    if (window.location.pathname.startsWith("/login")) return;

    let cancelled = false;

    const run = async () => {
      // 先等后端就绪（/readyz 不经过代理，不会在控制台刷红字），
      // 再去问 /api/auth/me，否则后端刚起的那几秒会误判成「没登录」
      for (let i = 0; i < 60 && !cancelled; i++) {
        try {
          const probe = await fetch("/readyz", { cache: "no-store" });
          if (probe.ok && ((await probe.json()) as { ready?: boolean }).ready) break;
        } catch {
          /* 还没起来 */
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      if (cancelled) return;

      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (cancelled || res.status !== 401) return;
        if (window.location.pathname.startsWith("/login")) return;
        const from = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace(`/login?from=${from}`);
      } catch {
        /* 后端没起来时不要把人赶去登录页，页面自己会提示 */
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
