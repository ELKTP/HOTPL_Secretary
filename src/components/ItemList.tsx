"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, SOURCE_LABEL, toImageInput } from "@/lib/client";
import { getSupabase } from "@/lib/supabase";
import type { Item } from "@/lib/types";

const STATUS: Record<Item["status"], { label: string; className: string }> = {
  pending: { label: "분석 중", className: "bg-amber-100 text-amber-800" },
  done: { label: "저장됨", className: "bg-emerald-100 text-emerald-800" },
  no_place: { label: "장소 없음", className: "bg-zinc-100 text-zinc-600" },
  needs_input: { label: "확인 필요", className: "bg-sky-100 text-sky-800" },
  error: { label: "오류", className: "bg-red-100 text-red-700" },
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
  const [items, setItems] = useState<Item[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => fetchRecentItems().then(setItems), []);

  useEffect(() => {
    let active = true;
    fetchRecentItems().then((data) => active && setItems(data));
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const hasPending = items.some((i) => i.status === "pending");
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [hasPending, load]);

  async function remove(id: string) {
    await getSupabase().from("items").delete().eq("id", id);
    load();
  }

  if (!items.length) {
    return <p className="py-6 text-center text-sm text-zinc-400">아직 저장한 게시물이 없어요.</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const s = STATUS[item.status];
        return (
          <li key={item.id} className="card space-y-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-zinc-400">
                  {SOURCE_LABEL[item.source] ?? item.source} · {new Date(item.created_at).toLocaleString("ko-KR")}
                </p>
                <p className="truncate text-sm">{item.shared_text?.split("\n")[0] || item.url || "스크린샷"}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${s.className}`}>
                {item.status === "done" ? `장소 ${item.place_count}곳` : s.label}
              </span>
            </div>
            {item.note && item.status !== "pending" && <p className="text-xs text-zinc-500">{item.note}</p>}
            <div className="flex gap-3 text-xs">
              {item.status !== "pending" && item.status !== "done" && (
                <button className="font-semibold text-brand" onClick={() => setOpenId(openId === item.id ? null : item.id)}>
                  내용 보충해서 다시 분석
                </button>
              )}
              {item.url && (
                <a className="text-zinc-500" href={item.url} target="_blank" rel="noreferrer">
                  원본 보기
                </a>
              )}
              <button className="ml-auto text-zinc-400" onClick={() => remove(item.id)}>
                삭제
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
    <div className="space-y-2 rounded-xl bg-zinc-50 p-3">
      <textarea
        className="input min-h-20"
        placeholder="게시물 캡션이나 장소명·주소를 붙여넣어 주세요"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <input ref={fileRef} type="file" accept="image/*" multiple className="text-xs" />
      <button className="btn-primary w-full" onClick={submit} disabled={busy}>
        {busy ? "요청 중…" : "다시 분석"}
      </button>
    </div>
  );
}
