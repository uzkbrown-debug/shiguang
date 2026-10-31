"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import RecallStage from "@/components/shiguang/RecallStage";

function RecallInner() {
  const router = useRouter();
  const params = useSearchParams();
  // 年份直接用 URL 里的：以前是拿本地示例数据的年份去校验，后端有记忆的年份会被判成"没有"
  const requested = Number(params.get("year"));
  const year = Number.isFinite(requested) && requested > 1900 ? requested : new Date().getFullYear();

  return (
    <RecallStage
      year={year}
      onExit={() => router.push("/timeline")}
      onOpenStory={() => router.push("/stories")}
    />
  );
}

export default function RecallPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 z-[80] bg-slate-950" />}>
      <RecallInner />
    </Suspense>
  );
}
