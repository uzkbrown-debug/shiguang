"use client";

import Link from "next/link";
import { LogIn, Sparkles } from "lucide-react";

export interface ProfileCardProps {
  /** 已登录时的真实用户；未登录为 null */
  name?: string | null;
  avatar?: string | null;
  bio?: string | null;
  username?: string | null;
  memoryCount?: number;
  photoCount?: number;
  /** 点进个人主页 */
  href?: string | null;
  /** 头像上传中/未登录时的提示 */
  hint?: string | null;
}

export default function ProfileCard({
  name,
  avatar,
  bio,
  username,
  memoryCount = 0,
  photoCount = 0,
  href,
  hint,
}: ProfileCardProps) {
  const loggedIn = Boolean(name);
  const displayName = name || "未登录";
  const initial = displayName.slice(0, 1);

  return (
    <div className="rounded-3xl bg-white/40 dark:bg-slate-800/50 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-xl p-5 md:p-8 flex flex-col justify-between transition-all duration-700 relative overflow-hidden w-full h-full min-h-[200px] md:min-h-[280px]">
      <div className="flex items-start justify-between relative z-10">
        <div className="flex items-center gap-4 md:gap-6">
          <div className="flex-shrink-0">
            {href ? (
              <Link
                href={href}
                className="block w-16 h-16 md:w-24 md:h-24 rounded-full bg-gradient-to-tr from-sky-400 via-indigo-400 to-purple-400 p-[3px] shadow-lg transition-all duration-500 hover:shadow-xl hover:scale-110"
                title="进入我的主页"
              >
                <Avatar avatar={avatar} initial={initial} name={displayName} />
              </Link>
            ) : (
              <div className="w-16 h-16 md:w-24 md:h-24 rounded-full bg-gradient-to-tr from-sky-400 via-indigo-400 to-purple-400 p-[3px] shadow-lg">
                <Avatar avatar={avatar} initial={initial} name={displayName} />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-3xl font-bold text-slate-900 dark:text-white mb-1 md:mb-2 tracking-wider transition-colors duration-700 truncate">
              {displayName}
            </h1>
            <p className="text-sm md:text-base text-slate-700 dark:text-slate-300 font-medium leading-relaxed max-w-md transition-colors duration-700">
              {bio || (loggedIn ? "还没有写下简介" : "登录后这里会显示你自己的名字、头像和真实统计")}
            </p>
            {username && (
              <p className="mt-1 text-[11px] text-slate-400">@{username}</p>
            )}
            {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-end md:items-center justify-between mt-4 md:mt-8 gap-4 md:gap-6 relative z-10">
        {loggedIn ? (
          <div className="flex gap-6 w-full md:w-auto justify-around md:justify-start">
            <StatItem count={memoryCount} label="记忆" color="text-indigo-600 dark:text-indigo-400" />
            <div className="w-px h-10 bg-slate-300/50 dark:bg-slate-700 hidden md:block" />
            <StatItem count={photoCount} label="照片" color="text-pink-600 dark:text-pink-400" />
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <Sparkles className="w-3.5 h-3.5" />
            新账号从 0 开始，统计只算你自己的内容
          </div>
        )}

        <div className="flex gap-2 flex-wrap justify-end">
          {loggedIn && href ? (
            <Link
              href={href}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] bg-sky-500/10 text-sky-600 dark:text-sky-300 hover:bg-sky-500/20 transition-colors"
            >
              进入我的主页
            </Link>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] tech-btn text-white"
            >
              <LogIn className="w-3.5 h-3.5" />
              登录 / 注册
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function Avatar({
  avatar,
  initial,
  name,
}: {
  avatar?: string | null;
  initial: string;
  name: string;
}) {
  if (avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={avatar}
        alt={name}
        className="w-full h-full rounded-full object-cover bg-white dark:bg-slate-800"
      />
    );
  }
  return (
    <span className="w-full h-full rounded-full bg-gradient-to-br from-cyan-400 to-indigo-500 flex items-center justify-center text-white text-xl md:text-3xl font-semibold">
      {initial}
    </span>
  );
}

function StatItem({
  count,
  label,
  color,
}: {
  count: number;
  label: string;
  color: string;
}) {
  return (
    <div className="text-center group/stat">
      <div
        className={`text-xl md:text-2xl font-black ${color} transition-transform group-hover/stat:scale-110`}
      >
        {count}
      </div>
      <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
        {label}
      </div>
    </div>
  );
}
