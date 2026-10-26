"use client";

import { useEffect, useMemo, useState } from "react";
import { Layers, Search } from "lucide-react";
import PlaceCard from "@/components/PlaceCard";
import { getSupabase } from "@/lib/supabase";
import { CATEGORIES, type Place, type PlaceStatus } from "@/lib/types";

const TABS: { value: PlaceStatus | "all"; label: string }[] = [
  { value: "want", label: "가고 싶음" },
  { value: "visited", label: "다녀옴" },
  { value: "skip", label: "제외" },
  { value: "all", label: "전체" },
];

export default function PlacesPage() {
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [tab, setTab] = useState<PlaceStatus | "all">("want");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    getSupabase()
      .from("places")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1000)
      .then(({ data }) => setPlaces((data as Place[]) ?? []));
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (places ?? []).filter(
      (p) =>
        (tab === "all" || p.status === tab) &&
        (!category || p.category === category) &&
        (!q || [p.name, p.area, p.address, p.summary, ...p.tags, ...p.good_for].join(" ").toLowerCase().includes(q)),
    );
  }, [places, tab, category, query]);

  async function setStatus(id: string, status: PlaceStatus) {
    setPlaces((ps) => ps!.map((p) => (p.id === id ? { ...p, status } : p)));
    await getSupabase().from("places").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  }

  async function remove(id: string) {
    if (!confirm("이 장소를 삭제할까요?")) return;
    setPlaces((ps) => ps!.filter((p) => p.id !== id));
    await getSupabase().from("places").delete().eq("id", id);
  }

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div className="space-y-1.5">
          <p className="eyebrow">Library</p>
          <h1 className="text-2xl font-bold tracking-tight">내 장소</h1>
        </div>
        {places && (
          <span className="rounded-md border border-line bg-surface px-2 py-1 font-mono text-[11px] text-fg-2">
            {shown.length} / {places.length}
          </span>
        )}
      </header>

      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-3" />
          <input className="input pl-9" placeholder="이름·지역·태그로 검색 (예: 성수, 루프탑)" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <select className="input w-auto py-2" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">모든 종류</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <div className="flex flex-1 gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1">
            {TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={`flex-1 rounded-md px-2.5 py-1 text-xs whitespace-nowrap transition ${
                  tab === t.value ? "bg-surface-3 font-medium text-fg" : "text-fg-3 hover:text-fg-2"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {places === null ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-36 animate-pulse" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-12 text-center text-sm text-fg-3">
          <Layers className="h-6 w-6" />
          {places.length ? "조건에 맞는 장소가 없어요." : "아직 저장된 장소가 없어요. 홈에서 저장하거나 가져오기를 이용해 보세요."}
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((p) => (
            <PlaceCard key={p.id} place={p} onStatus={(s) => setStatus(p.id, s)} onDelete={() => remove(p.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
