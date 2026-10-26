"use client";

import { useEffect, useMemo, useState } from "react";
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
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <h1 className="text-xl font-bold">내 장소</h1>
        <span className="text-sm text-zinc-500">{places ? `${shown.length} / ${places.length}곳` : ""}</span>
      </div>
      <div className="space-y-2">
        <input className="input" placeholder="이름·지역·태그로 검색 (예: 성수, 루프탑)" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="flex gap-2">
          <select className="input w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">모든 종류</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <div className="flex flex-1 gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={`chip whitespace-nowrap ${tab === t.value ? "border-brand bg-brand text-white" : "border-zinc-200 bg-white text-zinc-600"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {places === null ? (
        <p className="py-10 text-center text-sm text-zinc-400">불러오는 중…</p>
      ) : shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-400">
          {places.length ? "조건에 맞는 장소가 없어요." : "아직 저장된 장소가 없어요. 홈에서 저장하거나 가져오기를 이용해 보세요."}
        </p>
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
