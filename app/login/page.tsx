"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { siteConfig } from "@/siteConfig";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const auth = siteConfig.auth;
    if (!auth || loading) return;
    setError("");
    setLoading(true);

    setTimeout(() => {
      if (username.trim() === auth.username && password === auth.password) {
        document.cookie = `${auth.cookieName}=${auth.token}; path=/; max-age=${
          60 * 60 * 24 * 7
        }; SameSite=Lax`;
        const from =
          new URLSearchParams(window.location.search).get("from") || "/";
        router.replace(from);
        router.refresh();
      } else {
        setError("账号或密码不正确");
        setLoading(false);
      }
    }, 300);
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-3xl border border-white/40 dark:border-white/10 bg-white/50 dark:bg-slate-800/60 backdrop-blur-xl shadow-2xl p-8"
      >
        <h1 className="text-center text-xl font-black tracking-wider text-slate-900 dark:text-white">
          {siteConfig.title}
        </h1>
        <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
          请输入访问密码
        </p>

        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="账号"
          autoComplete="username"
          className="mt-6 w-full rounded-xl border border-slate-300/60 dark:border-slate-600/60 bg-white/70 dark:bg-slate-900/50 px-4 py-2.5 text-sm outline-none transition focus:border-indigo-400"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="密码"
          autoComplete="current-password"
          className="mt-3 w-full rounded-xl border border-slate-300/60 dark:border-slate-600/60 bg-white/70 dark:bg-slate-900/50 px-4 py-2.5 text-sm outline-none transition focus:border-indigo-400"
        />

        {error && <p className="mt-3 text-xs text-rose-500">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          {loading ? "验证中…" : "进入"}
        </button>

        <p className="mt-4 text-center text-[10px] text-slate-400 dark:text-slate-500">
          默认账号 admin / admin，可用环境变量覆盖
        </p>
      </form>
    </main>
  );
}
