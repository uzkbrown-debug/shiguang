"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  User,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  UserPlus,
  MapPin,
  KeyRound,
  HelpCircle,
  Loader2,
} from "lucide-react";
import { fetchMe, login, register } from "@/lib/session";

type Mode = "login" | "register" | "forgot";

const QUESTIONS = [
  "我最喜欢的城市是？",
  "我小学的名字是？",
  "我第一只宠物的名字是？",
  "我最喜欢的食物是？",
  "我妈妈的生日是？",
];

async function api<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { detail?: string }).detail || "操作失败");
  return data as T;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [question, setQuestion] = useState(QUESTIONS[0]);
  const [answer, setAnswer] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetStep, setResetStep] = useState<"ask" | "verify">("ask");
  const [askedQuestion, setAskedQuestion] = useState("");

  useEffect(() => {
    fetchMe().then((me) => {
      if (!me) return;
      const params = new URLSearchParams(window.location.search);
      router.replace(params.get("from") || "/");
    });
  }, [router]);

  const go = (next: Mode) => {
    setMode(next);
    setError("");
    setResetStep("ask");
    setAskedQuestion("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(username.trim(), password, remember);
        const params = new URLSearchParams(window.location.search);
        router.replace(params.get("from") || "/");
        router.refresh();
        return;
      }

      if (mode === "register") {
        await register({
          username: username.trim(),
          password,
          nickname: nickname.trim() || undefined,
          home_city: homeCity.trim() || undefined,
          security_question: question,
          security_answer: answer.trim(),
        });
        router.replace("/");
        router.refresh();
        return;
      }

      if (resetStep === "ask") {
        const data = await api<{ question: string }>("/api/auth/forgot", {
          username: username.trim(),
        });
        setAskedQuestion(data.question);
        setResetStep("verify");
        setLoading(false);
        return;
      }
      await api("/api/auth/reset", {
        username: username.trim(),
        answer: answer.trim(),
        new_password: password,
      });
      setMode("login");
      setResetStep("ask");
      setError("密码已重设，用新密码登录");
      setLoading(false);
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
      setLoading(false);
    }
  };

  const inputClass =
    "w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-colors focus:border-cyan-400/60 focus:bg-white/[0.08]";

  const TABS: [Mode, string, typeof User][] = [
    ["login", "登录", User],
    ["register", "注册账号", UserPlus],
    ["forgot", "找回密码", KeyRound],
  ];

  return (
    <div className="fixed inset-0 z-[200] overflow-hidden bg-slate-950">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/wall_mushoku.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/75 via-slate-950/60 to-slate-950/85" />
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(34,211,238,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,.6) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />

      <div className="relative z-10 h-full flex items-center justify-center px-4 overflow-y-auto py-8">
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full max-w-[430px] rounded-3xl border border-white/15 bg-slate-900/60 backdrop-blur-2xl shadow-[0_24px_80px_-24px_rgba(0,0,0,0.85)] px-7 py-8 md:px-9 md:py-10"
        >
          <div className="absolute left-10 right-10 -top-px h-px bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent" />

          <div className="text-center mb-5">
            <h1
              className="text-3xl font-bold bg-gradient-to-r from-cyan-300 via-sky-400 to-violet-400 bg-clip-text text-transparent"
              style={{ fontFamily: "'Noto Serif SC', serif" }}
            >
              拾光
            </h1>
            <p className="mt-1.5 text-[11px] tracking-[0.24em] text-slate-400">AI 数字记忆与人生故事馆</p>
          </div>

          <div className="relative flex p-1 mb-5 rounded-xl bg-white/5 border border-white/10">
            {TABS.map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => go(key)}
                className={`relative flex-1 py-2 text-[11px] rounded-lg transition-colors ${
                  mode === key ? "text-slate-900" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {mode === key && (
                  <motion.span
                    layoutId="auth-tab"
                    className="absolute inset-0 rounded-lg bg-gradient-to-r from-cyan-300 to-sky-400"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative flex items-center justify-center gap-1">
                  <Icon className="w-3 h-3" />
                  {label}
                </span>
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3.5">
            <label className="block">
              <span className="text-[11px] text-slate-400">账号</span>
              <span className="mt-1.5 relative block">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  placeholder={mode === "register" ? "用户名（≥3 位，好友靠它加你）" : "请输入账号"}
                  className={inputClass}
                />
              </span>
            </label>

            <AnimatePresence initial={false}>
              {mode === "register" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-3.5 overflow-hidden"
                >
                  <label className="block">
                    <span className="text-[11px] text-slate-400">昵称（好友看到的名字）</span>
                    <span className="mt-1.5 relative block">
                      <UserPlus className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        placeholder="比如：小美"
                        className={inputClass}
                      />
                    </span>
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-slate-400">常驻城市（可留空）</span>
                    <span className="mt-1.5 relative block">
                      <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        value={homeCity}
                        onChange={(e) => setHomeCity(e.target.value)}
                        placeholder="上海"
                        className={inputClass}
                      />
                    </span>
                  </label>
                </motion.div>
              )}
            </AnimatePresence>

            {mode === "forgot" && resetStep === "verify" && (
              <div className="px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-400/30">
                <p className="flex items-center gap-1.5 text-[11px] text-emerald-200">
                  <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                  密保问题：{askedQuestion}
                </p>
              </div>
            )}

            <label className="block">
              <span className="text-[11px] text-slate-400">{mode === "forgot" ? "新密码" : "密码"}</span>
              <span className="mt-1.5 relative block">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  placeholder={mode === "login" ? "请输入密码" : "至少 6 位"}
                  className="w-full pl-10 pr-11 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-colors focus:border-cyan-400/60 focus:bg-white/[0.08]"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-500 hover:text-slate-300"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </span>
            </label>

            {mode !== "login" && (
              <>
                {mode === "register" && (
                  <label className="block">
                    <span className="text-[11px] text-slate-400">密保问题（忘记密码时用）</span>
                    <select
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      className="mt-1.5 w-full px-3 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-100 outline-none focus:border-cyan-400/60"
                    >
                      {QUESTIONS.map((q) => (
                        <option key={q} value={q} className="bg-slate-900">
                          {q}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="block">
                  <span className="text-[11px] text-slate-400">密保答案</span>
                  <span className="mt-1.5 relative block">
                    <HelpCircle className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder="别忘了，找回密码就靠它"
                      className={inputClass}
                    />
                  </span>
                </label>
              </>
            )}

            <div className="flex items-center justify-between pt-1 min-h-[20px]">
              {mode === "login" ? (
                <label className="flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 accent-cyan-500"
                  />
                  记住我（7 天）
                </label>
              ) : (
                <button
                  type="button"
                  onClick={() => go("login")}
                  className="text-[11px] text-slate-400 hover:text-cyan-300"
                >
                  ← 回登录
                </button>
              )}
              {error && (
                <motion.span
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`text-[11px] ${error.includes("已重设") ? "text-emerald-400" : "text-rose-400"}`}
                >
                  {error}
                </motion.span>
              )}
            </div>

            <motion.button
              type="submit"
              whileTap={{ scale: 0.985 }}
              disabled={loading}
              className="tech-btn mt-1 w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-white disabled:opacity-70"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  处理中
                </span>
              ) : (
                <>
                  {mode === "login" && "进入拾光"}
                  {mode === "register" && "创建账号并进入"}
                  {mode === "forgot" && (resetStep === "ask" ? "下一步" : "重设密码")}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </motion.button>
          </form>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-[10px] text-slate-500 text-center">
            <ShieldCheck className="w-3 h-3 shrink-0" />
            注册后可在「好友」页用账号搜索加人 · 记忆默认「好友可见」
          </p>
        </motion.div>
      </div>
    </div>
  );
}
