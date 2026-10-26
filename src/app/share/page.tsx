"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bookmark, CircleCheck, CircleHelp, LoaderCircle, TriangleAlert } from "lucide-react";
import { api, toImageInput } from "@/lib/client";
import type { ImageInput } from "@/lib/types";

interface Shared {
  title: string;
  text: string;
  url: string;
  images: ImageInput[];
}

/** Reads what the share sheet sent: from the service worker cache, or from query params. */
async function readShared(): Promise<Shared> {
  const params = new URLSearchParams(window.location.search);
  const shared: Shared = {
    title: params.get("title") ?? "",
    text: params.get("text") ?? "",
    url: params.get("url") ?? "",
    images: [],
  };
  if (params.get("from") === "sw" && "caches" in window) {
    const cache = await caches.open("share-target");
    const metaRes = await cache.match("/share-target/meta");
    if (metaRes) {
      const meta = (await metaRes.json()) as { title: string; text: string; url: string; files: string[] };
      Object.assign(shared, { title: meta.title, text: meta.text, url: meta.url });
      for (const key of meta.files) {
        const res = await cache.match(key);
        if (res) shared.images.push(await toImageInput(await res.blob()));
      }
      for (const key of await cache.keys()) await cache.delete(key);
    }
  }
  return shared;
}

export default function SharePage() {
  const [state, setState] = useState<"saving" | "saved" | "duplicate" | "empty" | "error">("saving");
  const [message, setMessage] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const shared = await readShared();
        if (!shared.text && !shared.url && !shared.images.length) {
          setState("empty");
          return;
        }
        const res = await api<{ duplicate?: boolean }>("/api/items", {
          title: shared.title,
          text: shared.text,
          url: shared.url,
          images: shared.images,
        });
        setState(res.duplicate ? "duplicate" : "saved");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "");
        setState("error");
      }
    })();
  }, []);

  const view = {
    saving: { icon: LoaderCircle, tone: "border-accent-deep bg-accent-bg text-accent", spin: true, title: "저장하는 중…", body: "잠시만 기다려 주세요." },
    saved: { icon: CircleCheck, tone: "border-success-line bg-success-bg text-success", spin: false, title: "저장했어요!", body: "장소 분석은 자동으로 진행돼요. 이제 원래 앱으로 돌아가셔도 돼요." },
    duplicate: { icon: Bookmark, tone: "border-info-line bg-info-bg text-info", spin: false, title: "이미 저장한 게시물이에요", body: "내 장소에서 확인할 수 있어요." },
    empty: { icon: CircleHelp, tone: "border-line bg-surface-2 text-fg-2", spin: false, title: "공유된 내용이 없어요", body: "링크나 스크린샷을 공유해 주세요." },
    error: { icon: TriangleAlert, tone: "border-danger-line bg-danger-bg text-danger", spin: false, title: "저장하지 못했어요", body: message || "잠시 후 다시 시도해 주세요." },
  }[state];
  const Icon = view.icon;

  return (
    <div className="flex flex-col items-center py-20 text-center">
      <span className={`grid h-16 w-16 place-items-center rounded-2xl border ${view.tone}`}>
        <Icon className={`h-7 w-7 ${view.spin ? "animate-spin" : ""}`} />
      </span>
      <h1 className="mt-5 text-xl font-bold tracking-tight">{view.title}</h1>
      <p className="mt-2 max-w-xs text-sm text-fg-2">{view.body}</p>
      {state !== "saving" && (
        <div className="mt-8 flex justify-center gap-2">
          <Link href="/add" className="btn-secondary">
            최근 저장 보기
          </Link>
          <Link href="/places" className="btn-primary">
            내 장소 보기
          </Link>
        </div>
      )}
    </div>
  );
}
