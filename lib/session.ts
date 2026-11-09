"use client";

// 账号相关的客户端接口：登录、注册、当前用户
import { useCallback, useEffect, useState } from "react";

export interface MeUser {
  id: string;
  username: string;
  nickname: string;
  avatar?: string | null;
  bio?: string | null;
  /** 个人主页顶部横幅 */
  banner?: string | null;
  /** 个人主页正文（极简 markdown） */
  about?: string | null;
  home_city?: string | null;
  /** 首页天气卡看哪座城市（空就用常驻城市） */
  weather_city?: string | null;
  created_at?: string | null;
  /** 密保问题（只对自己返回） */
  security_question?: string | null;
  /** 硬币余额（投币用） */
  coin_balance?: number | null;
  is_me?: boolean;
  stats?: {
    memory_count: number;
    route_count: number;
    guide_count: number;
    city_count: number;
    cities: string[];
    photo_count?: number;
    person_count?: number;
    year_span?: number;
  };
  friend_count?: number;
  pending_requests?: number;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { detail?: string }).detail || "操作失败");
  return data as T;
}

export async function login(username: string, password: string, remember = true) {
  return post<{ token: string; user: MeUser }>("/api/auth/login", { username, password, remember });
}

export async function register(input: {
  username: string;
  password: string;
  nickname?: string;
  home_city?: string;
  security_question?: string;
  security_answer?: string;
}) {
  return post<{ token: string; user: MeUser }>("/api/auth/register", input);
}

export async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/login";
}

export async function fetchMe(): Promise<MeUser | null> {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as MeUser;
  } catch {
    return null;
  }
}

/** 页面里读当前登录用户；loading 期间先别渲染用户相关内容 */
export function useMe() {
  const [me, setMe] = useState<MeUser | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    return fetchMe()
      .then(setMe)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // 放到下一个 tick：避免在 effect 体里同步 setState（React 19 的规则）
    const timer = setTimeout(() => void reload(), 0);
    return () => clearTimeout(timer);
  }, [reload]);

  return { me, loading, reload };
}

/** 改自己的资料：主页上看得见的字段都能改 */
export async function patchMe(
  body: Partial<
    Pick<
      MeUser,
      | "nickname"
      | "username"
      | "bio"
      | "avatar"
      | "banner"
      | "about"
      | "home_city"
      | "weather_city"
    >
  >,
) {
  const res = await fetch("/api/auth/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { detail?: string }).detail || "保存失败");
  return data as MeUser;
}

/** 上传头像（需要已登录）；返回更新后的用户 */
export async function uploadAvatar(file: File): Promise<MeUser> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/auth/avatar", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { detail?: string }).detail || "头像上传失败");
  return data as MeUser;
}

/** 上传主页横幅；返回更新后的用户 */
export async function uploadBanner(file: File): Promise<MeUser> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/auth/banner", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { detail?: string }).detail || "封面上传失败");
  return data as MeUser;
}

/** 改密码 */
export async function changePassword(oldPassword: string, newPassword: string) {
  return post<{ ok: boolean }>("/api/auth/change-password", {
    old_password: oldPassword,
    new_password: newPassword,
  });
}

/** 设置 / 修改密保问题 */
export async function setSecurity(question: string, answer: string) {
  const res = await fetch("/api/auth/security", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ security_question: question, security_answer: answer }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { detail?: string }).detail || "保存失败");
  return data as { ok: boolean; question: string };
}
