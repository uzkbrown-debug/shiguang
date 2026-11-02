"use client";

import { useEffect, useRef, useState } from "react";
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
  Camera,
  Plus,
  Sparkles,
  Compass,
  Images,
} from "lucide-react";
import { fetchMe, login, register, uploadAvatar } from "@/lib/session";

type Mode = "login" | "register" | "forgot";

const QUESTIONS = [
  "我最喜欢的城市是？",
  "我小学的名字是？",
  "我第一只宠物的名字是？",
  "我最喜欢的食物是？",
  "我妈妈的生日是？",
];

const HIGHLIGHTS = [
  { icon: Images, title: "记忆有出处", desc: "每段回忆都带照片、时间、地点，随时翻得到" },
  { icon: Compass, title: "旅行连成线", desc: "照片自动写成攻略，地图上留下你走过的点" },
  { icon: Sparkles, title: "小拾记得你", desc: "问她「我去过哪」，她只照着你的真实记录答" },
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
  const [agree, setAgree] = useState(true);
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetStep, setResetStep] = useState<"ask" | "verify">("ask");
  const [askedQuestion, setAskedQuestion] = useState("");

  // 头像
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>("");

  useEffect(() => {
    fetchMe().then((me) => {
      if (!me) return;
      const params = new URLSearchParams(window.location.search);
      router.replace(params.get("from") || "/");
    });
  }, [router]);

  // 预览地址用完要释放，避免内存泄漏
  useEffect(
    () => () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    },
    [avatarPreview],
  );

  const go = (next: Mode) => {
    setMode(next);
    setError("");
    setNotice("");
    setResetStep("ask");
    setAskedQuestion("");
  };

  const pickAvatar = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("头像要选图片文件");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("头像不要超过 5 MB");
      return;
    }
    setError("");
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setNotice("");

    if (mode !== "login" && !agree) {
      setError("请先同意用户协议");
      return;
    }

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
        // 注册接口已经建好会话，这里能直接传头像；失败也不挡注册
        if (avatarFile) {
          try {
            await uploadAvatar(avatarFile);
          } catch {
            /* 头像失败不影响账号，进设置里还能再传 */
          }
        }
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
      setNotice("密码已重设，用新密码登录");
      setLoading(false);
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
      setLoading(false);
    }
  };

  const inputClass =
    "w-full py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-colors focus:border-cyan-400/60 focus:bg-white/[0.08]";

  const TABS: [Mode, string, typeof User][] = [
    ["login", "登录", User],
    ["register", "注册", UserPlus],
    ["forgot", "找回密码", KeyRound],
  ];

  return (
    <div className="fixed inset-0 z-[200] overflow-y-auto bg-slate-950">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/wall_mushoku.jpg"
        alt=""
        className="fixed inset-0 w-full h-full object-cover"
      />
      <div className="fixed inset-0 bg-gradient-to-br from-slate-950/85 via-slate-950/70 to-indigo-950/85" />
      <div
        className="fixed inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(34,211,238,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,.6) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />

      <div className="relative z-10 min-h-full flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-5xl grid lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-14 items-center">
          {/* 左边：品牌与卖点 */}
          <motion.div
            initial={{ opacity: 0, x: -18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="hidden lg:block text-slate-100"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 text-[11px] text-cyan-200">
              <Sparkles className="w-3 h-3" />
              AI 数字记忆与人生故事馆
            </div>
            <h1
              className="mt-5 text-6xl font-bold bg-gradient-to-r from-cyan-200 via-sky-300 to-violet-300 bg-clip-text text-transparent"
              style={{ fontFamily: "'Noto Serif SC', serif" }}
            >
              拾光
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-300/90 max-w-md">
              把照片、去过的地方和那天的情绪存在一起。以后问一句「我去过哪」，
              它只照着你的真实记录回答，并告诉你是谁陪你去的。
            </p>

            <ul className="mt-8 space-y-4">
              {HIGHLIGHTS.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.title} className="flex items-start gap-3">
                    <span className="mt-0.5 w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-cyan-300" />
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-slate-100">{item.title}</span>
                      <span className="block text-[11px] text-slate-400">{item.desc}</span>
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="mt-8 inline-flex items-center gap-2 text-[11px] text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              记忆默认「好友可见」，只有你允许的人才看得到
            </div>
          </motion.div>

          {/* 右边：表单卡片 */}
          <motion.div
            initial={{ opacity: 0, y: 22, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-[430px] mx-auto rounded-3xl border border-white/15 bg-slate-900/70 backdrop-blur-2xl shadow-[0_24px_80px_-24px_rgba(0,0,0,0.9)] px-6 py-7 md:px-8 md:py-9"
          >
            <div className="absolute left-10 right-10 -top-px h-px bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent" />

            <div className="lg:hidden text-center mb-4">
              <h1
                className="text-2xl font-bold bg-gradient-to-r from-cyan-300 via-sky-400 to-violet-400 bg-clip-text text-transparent"
                style={{ fontFamily: "'Noto Serif SC', serif" }}
              >
                拾光
              </h1>
              <p className="mt-1 text-[10px] tracking-[0.22em] text-slate-400">
                AI 数字记忆与人生故事馆
              </p>
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
              {/* 注册：头像 */}
              <AnimatePresence initial={false}>
                {mode === "register" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center gap-4 pb-1">
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="relative w-16 h-16 rounded-full overflow-hidden border border-dashed border-white/25 bg-white/5 flex items-center justify-center text-slate-400 hover:border-cyan-400/60 hover:text-cyan-300 transition-colors shrink-0"
                        title="选择头像"
                      >
                        {avatarPreview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={avatarPreview} alt="头像预览" className="w-full h-full object-cover" />
                        ) : (
                          <Camera className="w-5 h-5" />
                        )}
                        <span className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-cyan-400 text-slate-900 flex items-center justify-center">
                          <Plus className="w-3 h-3" />
                        </span>
                      </button>
                      <div className="min-w-0">
                        <div className="text-[11px] text-slate-300">头像（可选）</div>
                        <div className="text-[10px] text-slate-500 leading-relaxed">
                          点击左边的圆圈上传，jpg / png / webp，5MB 以内
                        </div>
                        {avatarFile && (
                          <button
                            type="button"
                            onClick={() => {
                              setAvatarFile(null);
                              setAvatarPreview("");
                              if (fileRef.current) fileRef.current.value = "";
                            }}
                            className="mt-1 text-[10px] text-rose-400 hover:underline"
                          >
                            移除头像
                          </button>
                        )}
                      </div>
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => pickAvatar(e.target.files?.[0] ?? null)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <label className="block">
                <span className="text-[11px] text-slate-400">账号</span>
                <span className="mt-1.5 relative block">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    value={username}
                    onChange={(e) =>
                      setUsername(mode === "register" ? e.target.value.replace(/\D/g, "") : e.target.value)
                    }
                    inputMode={mode === "register" ? "numeric" : undefined}
                    autoComplete="username"
                    required
                    placeholder={mode === "register" ? "账号只能用数字，例如 13800001234" : "请输入账号"}
                    className={`${inputClass} pl-10 pr-4`}
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
                          placeholder="比如：烟花易冷"
                          className={`${inputClass} pl-10 pr-4`}
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
                          className={`${inputClass} pl-10 pr-4`}
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
                <span className="text-[11px] text-slate-400">
                  {mode === "forgot" ? "新密码" : "密码"}
                </span>
                <span className="mt-1.5 relative block">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    required
                    placeholder={mode === "login" ? "请输入密码" : "至少 6 位"}
                    className={`${inputClass} pl-10 pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    aria-label={showPwd ? "隐藏密码" : "显示密码"}
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
                        className={`${inputClass} pl-10 pr-4`}
                      />
                    </span>
                  </label>
                </>
              )}

              <div className="flex items-center justify-between gap-2 pt-1 min-h-[20px]">
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
                  <label className="flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={agree}
                      onChange={(e) => setAgree(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 accent-cyan-500"
                    />
                    同意用户协议与隐私说明
                  </label>
                )}
                {mode === "login" ? (
                  <button
                    type="button"
                    onClick={() => go("forgot")}
                    className="text-[11px] text-slate-400 hover:text-cyan-300"
                  >
                    忘记密码？
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => go("login")}
                    className="text-[11px] text-slate-400 hover:text-cyan-300"
                  >
                    回到登录
                  </button>
                )}
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-400/20 rounded-xl px-3 py-2"
                >
                  {error}
                </motion.p>
              )}
              {notice && (
                <p className="text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-400/20 rounded-xl px-3 py-2">
                  {notice}
                </p>
              )}

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

            <p className="mt-5 flex items-center justify-center gap-1.5 text-[10px] text-slate-500 text-center">
              <ShieldCheck className="w-3 h-3 shrink-0" />
              账号只能是数字、且不能重复 · 昵称可重复 · 好友能搜账号或昵称加你 · 记忆默认「仅自己可见」
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
