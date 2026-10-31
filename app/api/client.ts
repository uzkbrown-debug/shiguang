import { siteConfig } from "@/siteConfig";
import { demoResponse } from "@/data/demo/apiDemo";

const BASE_URL = siteConfig.apiBaseUrl;

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const method = options?.method ?? "GET";
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    if (!res.ok) {
      throw new ApiError(`API Error: ${res.status}`, res.status);
    }
    return await res.json();
  } catch (err) {
    // 后端未启动时回退到本地演示数据，保证页面有内容可看
    const demo = demoResponse(path, method);
    if (demo !== undefined) return demo as T;
    throw err;
  }
}

function qs(params?: Record<string, string | number | undefined>): string {
  if (!params) return "";
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== ""
  );
  if (!entries.length) return "";
  return "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

export { request, qs, ApiError, BASE_URL };
