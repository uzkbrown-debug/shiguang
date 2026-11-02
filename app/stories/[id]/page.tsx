"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Mic, Sparkles } from "lucide-react";

interface Scene {
  id: string;
  sort: number;
  narration?: string | null;
  image_url?: string | null;
  audio_url?: string | null;
  duration_ms?: number | null;
}

interface StoryDetail {
  id: string;
  title: string;
  subtitle?: string | null;
  cover?: string | null;
  style?: string | null;
  status?: string | null;
  voice?: string | null;
  scenes: Scene[];
}

export default function StoryReaderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [story, setStory] = useState<StoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/stories/${params.id}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "这篇故事不存在，或者不是你的" : "读取失败");
        return (await res.json()) as StoryDetail;
      })
      .then((data) => {
        if (alive) setStory(data);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "读取失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [params.id]);

  if (loading) {
    return (
      <div className="w-full py-24 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
      </div>
    );
  }

  if (!story) {
    return (
      <div className="max-w-3xl mx-auto py-24 text-center text-slate-400 text-sm">
        {error || "没有找到这篇故事。"}
        <div className="mt-4">
          <Link href="/stories" className="text-sky-500">
            返回故事馆
          </Link>
        </div>
      </div>
    );
  }

  const scenes = [...(story.scenes ?? [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

  return (
    <article className="w-full relative z-10 pb-16">
      <motion.header
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="relative h-[46vh] min-h-[280px] overflow-hidden bg-slate-900"
      >
        {story.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={story.cover} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/55 to-slate-950/95" />
        <button
          onClick={() => router.back()}
          className="absolute top-5 left-5 flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-black/35 backdrop-blur-md text-white/90 text-xs hover:bg-black/55 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          返回
        </button>
        <div className="absolute bottom-6 left-6 right-6 max-w-3xl">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-md text-[10px] text-white/90">
            <Mic className="w-3 h-3" />
            {story.status === "voiced" ? "已配音" : "草稿"} · {story.style || "warm"}
          </span>
          <h1
            className="mt-3 text-2xl md:text-4xl font-bold text-white"
            style={{ fontFamily: "'Noto Serif SC', serif" }}
          >
            {story.title}
          </h1>
        </div>
      </motion.header>

      <div className="max-w-3xl mx-auto px-5 md:px-8 -mt-6 relative">
        {scenes.length === 0 ? (
          <div className="rounded-2xl glass-card p-6 text-center text-xs text-slate-400">
            这个故事还没有分幕内容。
          </div>
        ) : (
          <div className="space-y-6">
            {scenes.map((scene, index) => (
              <motion.section
                key={scene.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.05, 0.3) }}
                className="rounded-2xl overflow-hidden glass-card border-white/40 dark:border-white/10"
              >
                {scene.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={scene.image_url} alt="" className="w-full max-h-[360px] object-cover" />
                )}
                <div className="p-4 md:p-5">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-2">
                    <Sparkles className="w-3 h-3" />
                    第 {index + 1} 幕
                  </div>
                  <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                    {scene.narration}
                  </p>
                  {scene.audio_url && (
                    <audio controls src={scene.audio_url} className="mt-3 w-full h-9" preload="none" />
                  )}
                </div>
              </motion.section>
            ))}
          </div>
        )}

        <div className="mt-8 text-center">
          <Link
            href="/stories"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl glass-button text-xs text-slate-600 dark:text-slate-200"
          >
            返回故事馆
          </Link>
        </div>
      </div>
    </article>
  );
}
