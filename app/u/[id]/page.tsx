"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  Eye,
  ImagePlus,
  KeyRound,
  Loader2,
  Save,
  ShieldQuestion,
} from "lucide-react";
import AboutProse from "@/components/shiguang/AboutProse";
import FriendButton from "@/components/shiguang/FriendButton";
import {
  patchMe,
  fetchMe,
  changePassword,
  setSecurity,
  uploadAvatar,
  uploadBanner,
  type MeUser,
} from "@/lib/session";
import { fetchGuides, fetchRoutes, type GuideBrief, type TravelRouteItem } from "@/lib/travel";

interface CircleMemory {
  id: string;
  title: string;
  summary?: string | null;
  happened_at: string;
  cover?: string | null;
  media_count: number;
  visibility: string;
}

interface CircleData {
  user: MeUser & { username: string; home_city?: string | null };
  is_friend: boolean;
  counts: { memories: number; hidden: number; cities: number };
  cities: string[];
  memories: CircleMemory[];
}

const FIELD =
  "w-full px-3 py-2 rounded-xl bg-white/60 dark:bg-white/5 border border-white/50 dark:border-white/10 text-xs text-slate-700 dark:text-slate-100 outline-none focus:border-emerald-400/60";
const LABEL = "text-[10.5px] font-medium text-slate-400 mb-1";

export default function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<CircleData | null>(null);
  const [guides, setGuides] = useState<GuideBrief[]>([]);
  const [routes, setRoutes] = useState<TravelRouteItem[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 自己的资料可以改：主页上看得见的东西全都能改
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [nickname, setNickname] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [about, setAbout] = useState("");
  const [banner, setBanner] = useState("");
  const [preview, setPreview] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [imgBusy, setImgBusy] = useState<"" | "avatar" | "banner">("");

  // 账号安全：另外两个按钮，跟资料分开存
  const [securityOpen, setSecurityOpen] = useState(false);
  const [secQuestion, setSecQuestion] = useState("");
  const [secAnswer, setSecAnswer] = useState("");
  const [secSaving, setSecSaving] = useState(false);
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetchMe().then((me) => {
        setMyId(me?.id ?? null);
        setSecQuestion(me?.security_question ?? "");
        return me;
      }),
      fetch(`/api/users/${id}/circle`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetchGuides({ owner: id }),
      fetchRoutes({ owner: id }),
    ])
      .then(([, circle, g, r]) => {
        const c = circle as CircleData | null;
        setData(c);
        setGuides(g ?? []);
        setRoutes(r ?? []);
        if (c) {
          setNickname(c.user.nickname);
          setUsername(c.user.username);
          setBio(c.user.bio ?? "");
          setHomeCity(c.user.home_city ?? "");
          setAbout(c.user.about ?? "");
          setBanner(c.user.banner ?? "");
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // 放到下一个 tick：避免在 effect 体里同步 setState（React 19 的规则）
    const timer = setTimeout(() => load(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const isMe = Boolean(myId && myId === id);
  const user = data?.user;

  const coverMemories = useMemo(() => data?.memories ?? [], [data]);
  // 横幅：自己设过的优先，其次用最近一条记忆的封面
  const bannerCover = banner || coverMemories.find((m) => m.cover)?.cover || null;
  const bannerChoices = useMemo(
    () => Array.from(new Set(coverMemories.map((m) => m.cover).filter(Boolean) as string[])),
    [coverMemories],
  );

  const onAvatar = async (file?: File | null) => {
    if (!file) return;
    setImgBusy("avatar");
    setError("");
    try {
      await uploadAvatar(file);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "头像上传失败");
    } finally {
      setImgBusy("");
    }
  };

  const onBannerFile = async (file?: File | null) => {
    if (!file) return;
    setImgBusy("banner");
    setError("");
    try {
      await uploadBanner(file);
      setPickerOpen(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "封面上传失败");
    } finally {
      setImgBusy("");
    }
  };

  const pickBanner = async (url: string) => {
    setError("");
    setBanner(url);
    setPickerOpen(false);
    try {
      await patchMe({ banner: url });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "封面没换成");
    }
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await patchMe({ nickname, username, bio, home_city: homeCity, about, banner });
      setEditing(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const saveSecurity = async () => {
    setSecSaving(true);
    setNotice("");
    try {
      const r = await setSecurity(secQuestion, secAnswer);
      setSecQuestion(r.question);
      setSecAnswer("");
      setNotice("密保问题已更新");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSecSaving(false);
    }
  };

  const savePassword = async () => {
    setPwdSaving(true);
    setNotice("");
    try {
      await changePassword(oldPwd, newPwd);
      setOldPwd("");
      setNewPwd("");
      setNotice("密码已改，下次用新密码登录");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "改密码失败");
    } finally {
      setPwdSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full py-24 flex justify-center">
        <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="w-full py-24 text-center">
        <p className="text-sm text-slate-500">没有这个人。</p>
        <Link href="/friends" className="inline-block mt-4 text-xs text-emerald-500 hover:underline">
          回到好友页
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full py-6 md:py-10 relative z-10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 mb-4">
          <Link href="/friends" className="p-2 rounded-lg text-slate-400 hover:text-emerald-500">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <span className="text-xs text-slate-400">个人主页</span>
        </div>

        {/* 关于：一张卡讲清这个人 + 这个项目（版式照参考站的 about） */}
        <section className="glass-card rounded-3xl border-white/40 dark:border-white/10 overflow-hidden">
          {/* 顶部横幅 */}
          <div className="relative h-40 md:h-56 bg-slate-700">
            {bannerCover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={bannerCover} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-sky-500/35 via-emerald-500/25 to-transparent" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/25 to-transparent" />

            {isMe && editing && (
              <div className="absolute right-3 top-3 flex items-center gap-2">
                <button
                  onClick={() => setPickerOpen((v) => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/70 border border-white/20 text-[11px] text-slate-100 hover:border-emerald-400/60"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  换封面
                </button>
                <button
                  onClick={() => void pickBanner("")}
                  className="px-3 py-1.5 rounded-xl bg-slate-950/70 border border-white/20 text-[11px] text-slate-300 hover:border-rose-400/60"
                >
                  用渐变色
                </button>
              </div>
            )}
            {imgBusy === "banner" && (
              <div className="absolute inset-0 grid place-items-center bg-slate-950/50">
                <Loader2 className="w-6 h-6 text-emerald-300 animate-spin" />
              </div>
            )}
          </div>

          <div className="px-5 md:px-10 pb-8 md:pb-10">
            {/* 头像压在横幅下沿 + 大标题 */}
            <div className="relative z-10 -mt-12 md:-mt-14 flex items-end gap-4">
              <div className="relative shrink-0">
                {user.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatar}
                    alt=""
                    onClick={() => isMe && editing && avatarInput.current?.click()}
                    className={`w-24 h-24 md:w-28 md:h-28 rounded-full object-cover border-4 border-white dark:border-slate-900 bg-white ${
                      isMe && editing ? "cursor-pointer" : ""
                    }`}
                  />
                ) : (
                  <span className="w-24 h-24 md:w-28 md:h-28 rounded-full grid place-items-center text-3xl border-4 border-white dark:border-slate-900 bg-emerald-500/20 text-emerald-600 dark:text-emerald-300">
                    {user.nickname.slice(0, 1)}
                  </span>
                )}
                {isMe && editing && (
                  <button
                    onClick={() => avatarInput.current?.click()}
                    title="点击换头像"
                    className="absolute -right-1 -bottom-1 w-8 h-8 rounded-full bg-emerald-500 text-white grid place-items-center border-2 border-white dark:border-slate-900 shadow hover:bg-emerald-400"
                  >
                    {imgBusy === "avatar" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>

              <div className="pb-1 min-w-0 flex-1">
                {editing ? (
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="昵称"
                    maxLength={24}
                    className="w-full bg-white/60 dark:bg-white/5 border border-white/50 dark:border-white/10 rounded-xl px-3 py-1.5 text-xl md:text-2xl font-black tracking-tight text-slate-900 dark:text-white outline-none focus:border-emerald-400/60"
                    style={{ fontFamily: "'Noto Serif SC', serif" }}
                  />
                ) : (
                  <h1
                    className="text-2xl md:text-4xl font-black tracking-tight text-slate-900 dark:text-white"
                    style={{ fontFamily: "'Noto Serif SC', serif" }}
                  >
                    {user.nickname}
                    {isMe && (
                      <span className="ml-2 align-middle text-[11px] font-normal text-sky-500">（我）</span>
                    )}
                  </h1>
                )}

                <div className="mt-1.5 flex items-center gap-1 text-[10.5px] md:text-xs font-bold uppercase tracking-[0.18em] text-indigo-500 dark:text-indigo-400">
                  <span>About</span>
                  <span>@</span>
                  {editing ? (
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="账号（数字）"
                      maxLength={20}
                      title="账号就是登录名，只能用数字（3–20 位）"
                      className="w-32 px-2 py-0.5 rounded-lg bg-white/60 dark:bg-white/5 border border-white/50 dark:border-white/10 text-[11px] tracking-normal normal-case font-medium text-slate-700 dark:text-slate-100 outline-none focus:border-emerald-400/60"
                    />
                  ) : (
                    <span>{user.username}</span>
                  )}
                </div>
              </div>

              <div className="ml-auto pb-1 flex items-center gap-2 shrink-0">
                {isMe ? (
                  editing ? (
                    <>
                      <button
                        onClick={() => {
                          const u = data?.user;
                          if (u) {
                            setNickname(u.nickname);
                            setUsername(u.username);
                            setBio(u.bio ?? "");
                            setHomeCity(u.home_city ?? "");
                            setAbout(u.about ?? "");
                            setBanner(u.banner ?? "");
                          }
                          setEditing(false);
                          setError("");
                          setPickerOpen(false);
                        }}
                        className="px-4 py-2 rounded-xl glass-button text-xs text-slate-700 dark:text-slate-100"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => void save()}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 text-white text-xs disabled:opacity-60"
                      >
                        {saving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        保存
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setEditing(true)}
                      className="px-4 py-2 rounded-xl glass-button text-xs text-slate-700 dark:text-slate-100"
                    >
                      编辑资料
                    </button>
                  )
                ) : (
                  <FriendButton userId={user.id} onChanged={load} />
                )}
              </div>
            </div>


          {/* 封面选择：从自己的记忆封面里挑，或者直接传一张 */}
          {isMe && editing && pickerOpen && (
            <div className="px-5 md:px-10 py-4 border-b border-white/20 dark:border-white/10 bg-slate-950/20">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] text-slate-400">挑一张当封面（来自你的记忆），或者上传</p>
                <button
                  onClick={() => bannerInput.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-button text-[11px] text-slate-700 dark:text-slate-100"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  上传图片
                </button>
              </div>
              {bannerChoices.length ? (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {bannerChoices.map((url) => (
                    <button
                      key={url}
                      onClick={() => void pickBanner(url)}
                      className="relative aspect-[4/3] rounded-lg overflow-hidden border border-white/20 hover:border-emerald-400/70"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">还没有带封面的记忆，直接上传一张吧。</p>
              )}
            </div>
          )}

            {error && (
              <p className="mt-4 rounded-xl bg-rose-500/10 border border-rose-400/30 px-3 py-2 text-[11px] text-rose-500">
                {error}
              </p>
            )}

            {/* 正文 */}
            <div className="mt-5 md:mt-7 pt-5 md:pt-7 border-t border-white/30 dark:border-white/10">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                <span>@{editing ? username || user.username : user.username}</span>
                {editing ? (
                  <span className="flex items-center gap-1">
                    · 常驻
                    <input
                      value={homeCity}
                      onChange={(e) => setHomeCity(e.target.value)}
                      placeholder="城市"
                      maxLength={32}
                      className="w-24 px-2 py-0.5 rounded-lg bg-white/60 dark:bg-white/5 border border-white/50 dark:border-white/10 text-[11px] text-slate-600 dark:text-slate-200 outline-none focus:border-emerald-400/60"
                    />
                  </span>
                ) : (
                  user.home_city && <span>· 常驻 {user.home_city}</span>
                )}
                {!isMe && (data?.is_friend ? <span>· 好友</span> : <span>· 只看得到公开内容</span>)}
              </div>

              {editing ? (
                <div className="mt-3 space-y-1">
                  <p className={LABEL}>一句话简介（显示在正文最上面）</p>
                  <input
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    maxLength={200}
                    placeholder="把照片丢进来，剩下交给 AI"
                    className={FIELD}
                  />

                  <div className="flex items-center justify-between pt-4">
                    <p className={LABEL}>主页正文（支持 ## 小标题 / - 列表 / &gt; 引用 / **加粗**）</p>
                    <button
                      onClick={() => setPreview((v) => !v)}
                      className="flex items-center gap-1 text-[10.5px] text-slate-400 hover:text-emerald-500"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {preview ? "改回编辑" : "看效果"}
                    </button>
                  </div>
                  {preview ? (
                    <div className="rounded-xl border border-white/30 dark:border-white/10 bg-white/30 dark:bg-white/5 px-3 py-2">
                      <AboutProse text={about} />
                    </div>
                  ) : (
                    <textarea
                      value={about}
                      onChange={(e) => setAbout(e.target.value)}
                      rows={16}
                      placeholder={"## 你好\n写点关于自己的事吧。\n\n- 喜欢去哪\n- 和谁一起"}
                      className={`${FIELD} resize-y leading-6 font-mono text-[11.5px]`}
                    />
                  )}

                  {/* 账号安全 */}
                  <div className="pt-5 mt-5 border-t border-white/20 dark:border-white/10">
                    <button
                      onClick={() => setSecurityOpen((v) => !v)}
                      className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-300 hover:text-emerald-500"
                    >
                      <ShieldQuestion className="w-3.5 h-3.5" />
                      {securityOpen ? "收起账号安全" : "账号安全（改密码 / 密保问题）"}
                    </button>
                    {securityOpen && (
                      <div className="mt-3 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <p className={LABEL}>密保问题</p>
                            <input
                              value={secQuestion}
                              onChange={(e) => setSecQuestion(e.target.value)}
                              maxLength={32}
                              placeholder="比如：我的第一只猫叫什么"
                              className={FIELD}
                            />
                          </div>
                          <div>
                            <p className={LABEL}>新的答案</p>
                            <input
                              value={secAnswer}
                              onChange={(e) => setSecAnswer(e.target.value)}
                              placeholder="答案（找回密码用）"
                              className={FIELD}
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => void saveSecurity()}
                          disabled={secSaving}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-button text-[11px] text-slate-700 dark:text-slate-100 disabled:opacity-60"
                        >
                          {secSaving ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <ShieldQuestion className="w-3 h-3" />
                          )}
                          保存密保
                        </button>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                          <div>
                            <p className={LABEL}>原密码</p>
                            <input
                              type="password"
                              value={oldPwd}
                              onChange={(e) => setOldPwd(e.target.value)}
                              className={FIELD}
                            />
                          </div>
                          <div>
                            <p className={LABEL}>新密码（至少 6 位）</p>
                            <input
                              type="password"
                              value={newPwd}
                              onChange={(e) => setNewPwd(e.target.value)}
                              className={FIELD}
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => void savePassword()}
                          disabled={pwdSaving}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-button text-[11px] text-slate-700 dark:text-slate-100 disabled:opacity-60"
                        >
                          {pwdSaving ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <KeyRound className="w-3 h-3" />
                          )}
                          改密码
                        </button>
                        {notice && <p className="text-[11px] text-emerald-500">{notice}</p>}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <p className="mt-3 text-[13px] leading-7 text-slate-600 dark:text-slate-300">
                    {user.bio || "把照片丢进来，剩下交给 AI：认地点、认时间、写成一整段故事。"}
                  </p>
                  {user.about ? (
                    <AboutProse text={user.about} />
                  ) : (
                    isMe && (
                      <p className="mt-6 text-[12px] text-slate-400">
                        还没写正文，点右上角「编辑资料」写下你自己的介绍。
                      </p>
                    )
                  )}

                  <h2 className="mt-7 text-lg md:text-xl font-extrabold text-slate-900 dark:text-white">
                    {isMe ? "我在这里" : "TA 在这里"}
                  </h2>
                  <ul className="mt-3 pl-5 list-disc space-y-1 text-[13px] leading-7 text-slate-600 dark:text-slate-300">
                    <li>
                      <span className="font-semibold text-slate-800 dark:text-slate-100">记忆：</span>
                      {data?.counts.memories ?? 0} 段 · {data?.counts.cities ?? 0} 个城市
                    </li>
                    <li>
                      <span className="font-semibold text-slate-800 dark:text-slate-100">攻略：</span>
                      {guides.length} 篇 ·{" "}
                      <span className="font-semibold text-slate-800 dark:text-slate-100">路线：</span>
                      {routes.length} 条
                    </li>
                    {(data?.counts.hidden ?? 0) > 0 && (
                      <li>还有 {data?.counts.hidden} 段记忆设了「仅自己」，你看不到</li>
                    )}
                  </ul>

                  {data?.cities?.length ? (
                    <div className="mt-5 flex flex-wrap gap-1.5">
                      {data.cities.map((c) => (
                        <Link
                          key={c}
                          href={`/travel?destination=${encodeURIComponent(c)}`}
                          className="px-2 py-0.5 rounded-full bg-slate-500/10 text-[10px] text-slate-500 dark:text-slate-400 hover:bg-emerald-500/15"
                        >
                          {c}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </section>

        <input
          ref={avatarInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            void onAvatar(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={bannerInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            void onBannerFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
