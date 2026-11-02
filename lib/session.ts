"use client";

// 账号相关的客户端接口：登录、注册、当前用户
import { useCallback, useEffect, useState } from "react";

export interface MeUser {
  id: string;
  username: string;
  nickname: string;
  avatar?: string | null;
  bio?: string | null;
  home_city?: string | null;
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
    reload();
  }, [reload]);

  return { me, loading, reload };
}

export async function patchMe(body: Partial<Pick<MeUser, "nickname" | "bio" | "avatar" | "home_city">>) {
  const res = await fetch("/api/auth/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("保存失败");
  return (await res.json()) as MeUser;
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
