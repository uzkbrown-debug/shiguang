"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { User, LogOut, Clock, MapPin, BookOpen, X, LogIn, Compass, Sparkles, Camera } from "lucide-react";
import { fetchMe, logout as doLogout, uploadAvatar, type MeUser } from "@/lib/session";

/**
 * 头像固定在顶部导航栏最右侧（不再可拖动）。
 * 点开是账号菜单，向下展开、右对齐。
 */
export default function UserAvatar() {
  const pathname = usePathname();
  const [me, setMe] = useState<MeUser | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [hint, setHint] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 真实会话：和后端 /api/auth/me 保持一致
  const reload = useCallback(() => {
    fetchMe()
      .then(setMe)
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // 换页时（比如从 /login 回来）重新确认一次登录态
  useEffect(() => {
    if (pathname.startsWith("/login")) return;
    reload();
  }, [pathname, reload]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (pathname.startsWith("/login")) return null;

  const displayName = me?.nickname || me?.username || "未登录";
  const stats = me?.stats;

  const pickAvatar = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setHint("");
    try {
      const next = await uploadAvatar(file);
      setMe(next);
      setHint("头像已更新");
    } catch (err) {
      setHint(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute right-0 top-full mt-3 w-[268px] z-[60] rounded-2xl border border-white/50 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl overflow-hidden"
          >
            {me ? (
              <>
                <div className="p-4 flex items-center gap-3 border-b border-slate-200/60 dark:border-white/10">
                  {me.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={me.avatar}
                      alt={displayName}
                      className="w-11 h-11 rounded-full object-cover ring-2 ring-sky-400/40"
                    />
                  ) : (
                    <span className="w-11 h-11 rounded-full bg-gradient-to-br from-cyan-400 to-indigo-500 flex items-center justify-center text-white text-sm font-semibold ring-2 ring-sky-400/30">
                      {displayName.slice(0, 1)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {displayName}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      @{me.username}
                      {me.home_city ? ` · ${me.home_city}` : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => setOpen(false)}
                    aria-label="关闭"
                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-500/10 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {stats && (
                  <div className="grid grid-cols-3 divide-x divide-slate-200/60 dark:divide-white/10 border-b border-slate-200/60 dark:border-white/10">
                    {[
                      { label: "记忆", value: stats.memory_count },
                      { label: "攻略", value: stats.guide_count },
                      { label: "城市", value: stats.city_count },
                    ].map((item) => (
                      <div key={item.label} className="py-2.5 text-center">
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {item.value}
                        </div>
                        <div className="text-[10px] text-slate-400">{item.label}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-2">
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-500/10 transition-colors disabled:opacity-60"
                  >
                    <Camera className="w-4 h-4" />
                    {uploading ? "正在上传头像…" : "更换头像"}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void pickAvatar(e.target.files?.[0] ?? null)}
                  />
                  {hint && <p className="px-3 pb-1 text-[10px] text-slate-400">{hint}</p>}
                  {[
                    { href: `/u/${me.id}`, label: "我的主页", icon: User },
                    { href: "/timeline", label: "我的时间线", icon: Clock },
                    { href: "/map", label: "我的记忆地图", icon: MapPin },
                    { href: "/travel", label: "我的旅行攻略", icon: Compass },
                    { href: "/stories", label: "我的故事馆", icon: BookOpen },
                    { href: "/upload", label: "添加一条记忆", icon: Sparkles },
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
                    onClick={() => {
                      setOpen(false);
                      void doLogout();
                    }}
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
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {ready ? "未登录" : "正在确认登录状态…"}
                    </div>
                    <div className="text-[11px] text-slate-400">登录后同步你的记忆与收藏</div>
                  </div>
                </div>

                <Link
                  href={`/login?from=${encodeURIComponent(pathname || "/")}`}
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-medium hover:opacity-90 transition-opacity"
                >
                  <LogIn className="w-4 h-4" />
                  去登录 / 注册
                </Link>
                <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
                  注册后可以上传头像、加好友，记忆默认「仅自己可见」。
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        onClick={() => setOpen((v) => !v)}
        title={me ? displayName : "登录 / 注册"}
        aria-label={me ? "打开账号菜单" : "登录或注册"}
        className="w-9 h-9 rounded-full overflow-hidden border border-white/60 dark:border-white/20 bg-white/70 dark:bg-slate-800/70 backdrop-blur-md shadow-md flex items-center justify-center"
      >
        {me?.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.avatar} alt={displayName} className="w-full h-full object-cover" />
        ) : me ? (
          <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-cyan-400 to-indigo-500 text-white text-xs font-semibold">
            {displayName.slice(0, 1)}
          </span>
        ) : (
          <User className="w-4 h-4 text-slate-500 dark:text-slate-300" />
        )}
      </motion.button>
    </div>
  );
}
