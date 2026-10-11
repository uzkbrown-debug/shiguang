import { Suspense } from "react";
import TimelineClient from "./TimelineClient";

export default function TimelinePage() {
  return (
    <Suspense
      fallback={
        <div className="w-full py-24 flex justify-center">
          <div className="w-7 h-7 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <TimelineClient />
    </Suspense>
  );
}
