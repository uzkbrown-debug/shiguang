"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence, useMotionValue } from "framer-motion";
import { User, LogOut, Clock, MapPin, BookOpen, X } from "lucide-react";
import { getGithubUser } from "@/app/api/messages";
import type { GitHubUser } from "@/app/api/types";
import { siteConfig } from "@/siteConfig";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

const DEMO_USER: GitHubUser = {
  id: 900,
  login: "demo-user",
  avatar: "/images/hong.jpg",
  bio: "本机演示身份 · 前端开发 / 示例大学",
};

const POS_KEY = "avatar_pos";

export default function UserAvatar() {
  const pathname = usePathname();
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // 恢复上次拖到的位置
  useEffect(() => {
    try {
      const saved = localStorage.getItem(POS_KEY);
      if (saved) {
        const p = JSON.parse(saved) as { x: number; y: number };
        if (typeof p.x === "number" && typeof p.y === "number") {
          x.set(p.x);
          y.set(p.y);
        }
      }
    } catch {
      /* ignore */
    }
  }, [x, y]);

  // 拖动后别让它跑出屏幕
  const clampToViewport = () => {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    let nx = x.get();
    let ny = y.get();
    if (r.left < pad) nx += pad - r.left;
    if (r.right > window.innerWidth - pad) nx -= r.right - (window.innerWidth - pad);
    if (r.top < 72) ny += 72 - r.top;
    if (r.bottom > window.innerHeight - pad) ny -= r.bottom - (window.innerHeight - pad);
    x.set(nx);
    y.set(ny);
  };

  // 读取本地登录态（与留言板、说说共用同一份 localStorage）
  useEffect(() => {
    const saved = localStorage.getItem("github_user");
    if (saved) {
      try {
        setUser(JSON.parse(saved));
        return;
      } catch {
        /* ignore */
      }
    }
    const token = localStorage.getItem("github_token");
    if (token) {
      getGithubUser(token)
        .then((u) => {
          setUser(u);
          localStorage.setItem("github_user", JSON.stringify(u));
        })
        .catch(() => {
          localStorage.removeItem("github_token");
        });
    }
  }, []);

  // 点击外部关闭
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const login = () => {
    window.location.href = "/api/auth/github/login";
  };

  const loginAsDemo = () => {
    localStorage.setItem("github_user", JSON.stringify(DEMO_USER));
    setUser(DEMO_USER);
    setOpen(false);
  };

  const logout = () => {
    localStorage.removeItem("github_token");
    localStorage.removeItem("github_user");
    // 退出站点登录
    document.cookie = `${siteConfig.auth?.cookieName ?? "sg_auth"}=; path=/; max-age=0`;
    setUser(null);
    setOpen(false);
    window.location.href = "/login";
  };

  if (pathname.startsWith("/login")) return null;

  return (
    <motion.div
      ref={boxRef}
      drag
      dragMomentum={false}
      dragElastic={0.05}
      style={{ x, y }}
      onDragStart={() => {
        dragging.current = true;
      }}
      onDragEnd={() => {
        clampToViewport();
        try {
          localStorage.setItem(POS_KEY, JSON.stringify({ x: x.get(), y: y.get() }));
        } catch {
          /* ignore */
        }
        setTimeout(() => {
          dragging.current = false;
        }, 150);
      }}
      className="fixed bottom-6 left-20 z-30 cursor-grab active:cursor-grabbing touch-none select-none"
    >
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="absolute bottom-full mb-3 left-0 w-64 rounded-2xl border border-white/50 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl overflow-hidden"
          >
            {user ? (
              <>
                <div className="p-4 flex items-center gap-3 border-b border-slate-200/60 dark:border-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={user.avatar}
                    alt={user.login}
                    className="w-11 h-11 rounded-full object-cover ring-2 ring-sky-400/40"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {user.login}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">{user.bio || "已登录"}</div>
                  </div>
                  <button
                    onClick={() => setOpen(false)}
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-500/10 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="p-2">
                  {[
                    { href: "/timeline", label: "我的时间线", icon: Clock },
                    { href: "/map", label: "我的记忆地图", icon: MapPin },
                    { href: "/stories", label: "我的故事馆", icon: BookOpen },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-500/10 transition-colors"
                      >
                        <Icon className="w-4 h-4" />
                        {item.label}
                      </Link>
                    );
                  })}
                  <button
                    onClick={logout}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs text-rose-500 hover:bg-rose-500/10 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    退出登录
                  </button>
                </div>
              </>
            ) : (
              <div className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-full bg-slate-500/10 flex items-center justify-center">
                    <User className="w-5 h-5 text-slate-400" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">未登录</div>
                    <div className="text-[11px] text-slate-400">登录后同步你的记忆与收藏</div>
                  </div>
                </div>

                <button
                  onClick={login}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-medium hover:opacity-90 transition-opacity"
                >
                  <GithubIcon className="w-4 h-4" />
                  使用 GitHub 登录
                </button>
                <button
                  onClick={loginAsDemo}
                  className="mt-2 w-full px-3 py-2.5 rounded-xl glass-button text-xs text-slate-600 dark:text-slate-200"
                >
                  以演示身份进入
                </button>
                <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
                  后端未启动时，GitHub 登录不可用，可先用「演示身份」查看登录后的样子。
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => {
          if (dragging.current) return;
          setOpen((v) => !v);
        }}
        title={user ? `${user.login}（可拖动）` : "登录（可拖动）"}
        className="w-11 h-11 rounded-full overflow-hidden border border-white/50 dark:border-white/15 bg-white/70 dark:bg-slate-800/70 backdrop-blur-md shadow-lg flex items-center justify-center"
      >
        {user ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatar} alt={user.login} className="w-full h-full object-cover" />
        ) : (
          <User className="w-5 h-5 text-slate-500 dark:text-slate-300" />
        )}
      </motion.button>
    </motion.div>
  );
}
