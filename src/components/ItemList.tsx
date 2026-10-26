"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CirclePlay,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  ImagePlus,
  Inbox,
  Map as MapIcon,
  RefreshCw,
  Trash2,
  Type,
  type LucideIcon,
} from "lucide-react";
import { api, SOURCE_LABEL, timeAgo, toImageInput } from "@/lib/client";
import { getSupabase } from "@/lib/supabase";
import type { Item } from "@/lib/types";

const SOURCE_ICON: Record<string, LucideIcon> = {
  instagram: Camera,
  youtube: CirclePlay,
  kakaomap: MapIcon,
  navermap: MapIcon,
  googlemap: MapIcon,
  web: Globe,
  text: Type,
  image: ImageIcon,
};

const STATUS: Record<Item["status"], { label: string; className: string; dot: string }> = {
  pending: { label: "분석 중", className: "border-warn-line bg-warn-bg text-warn", dot: "bg-warn animate-pulse" },
  done: { label: "저장됨", className: "border-success-line bg-success-bg text-success", dot: "bg-success" },
  no_place: { label: "장소 없음", className: "border-line bg-surface-2 text-fg-3", dot: "bg-fg-3" },
  needs_input: { label: "확인 필요", className: "border-info-line bg-info-bg text-info", dot: "bg-info" },
  error: { label: "오류", className: "border-danger-line bg-danger-bg text-danger", dot: "bg-danger" },
};

const fetchRecentItems = () =>
  getSupabase()
    .from("items")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30)
    .then(({ data }) => (data as Item[]) ?? []);

/** Recent saves with their analysis status; polls while anything is still being analyzed. */
export default function ItemList({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => fetchRecentItems().then(setItems), []);

  useEffect(() => {
    let active = true;
    fetchRecentItems().then((data) => active && setItems(data));
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const hasPending = items?.some((i) => i.status === "pending");
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [hasPending, load]);

  async function remove(id: string) {
    await getSupabase().from("items").delete().eq("id", id);
    load();
  }

  if (items === null) return <div className="card h-24 animate-pulse" />;
  if (!items.length) {
    return (
      <div className="card flex flex-col items-center gap-2 py-10 text-center text-sm text-fg-3">
        <Inbox className="h-6 w-6" />
        아직 저장한 게시물이 없어요.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {items.map((item) => {
        const s = STATUS[item.status];
        const Icon = SOURCE_ICON[item.source] ?? Globe;
        const canRetry = item.status !== "pending" && item.status !== "done";
        return (
          <li key={item.id} className="space-y-2 p-3.5">
            <div className="flex items-start gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-fg-2">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{item.shared_text?.split("\n")[0] || item.url || "스크린샷"}</p>
                <p className="font-mono text-[11px] text-fg-3">
                  {SOURCE_LABEL[item.source] ?? item.source} · {timeAgo(item.created_at)}
                </p>
              </div>
              <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${s.className}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                {item.status === "done" ? `장소 ${item.place_count}곳` : s.label}
              </span>
            </div>
            {item.note && item.status !== "pending" && <p className="pl-11 text-xs leading-relaxed text-fg-2">{item.note}</p>}
            <div className="flex items-center gap-1.5 pl-11">
              {canRetry && (
                <button className="btn-mini" onClick={() => setOpenId(openId === item.id ? null : item.id)}>
                  <RefreshCw className="h-3 w-3" />
                  보충해서 다시 분석
                </button>
              )}
              {item.url && (
                <a className="btn-mini" href={item.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3 w-3" />
                  원본
                </a>
              )}
              <button className="ml-auto p-1 text-fg-3 transition hover:text-danger" onClick={() => remove(item.id)} aria-label="삭제">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {openId === item.id && (
              <RetryForm
                id={item.id}
                onDone={() => {
                  setOpenId(null);
                  load();
                }}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function RetryForm({ id, onDone }: { id: string; onDone: () => void }) {
  const [text, setText] = useState("");
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit() {
    setBusy(true);
    const files = Array.from(fileRef.current?.files ?? []).slice(0, 5);
    const images = await Promise.all(files.map((f) => toImageInput(f)));
    try {
      await api(`/api/items/${id}/retry`, { extraText: text, images });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ml-11 space-y-2 rounded-lg border border-line bg-canvas p-3">
      <textarea
        className="input min-h-20 resize-none"
        placeholder="게시물 캡션이나 장소명·주소를 붙여넣어 주세요"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex gap-2">
        <button className="btn-secondary flex-1 py-2" onClick={() => fileRef.current?.click()}>
          <ImagePlus className="h-4 w-4" />
          {count ? `이미지 ${count}장` : "스크린샷 추가"}
        </button>
        <button className="btn-primary flex-1 py-2" onClick={submit} disabled={busy || (!text.trim() && !count)}>
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          다시 분석
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => setCount(e.target.files?.length ?? 0)} />
    </div>
  );
}
