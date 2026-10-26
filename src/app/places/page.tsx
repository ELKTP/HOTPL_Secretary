"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Layers, Search, Sparkles } from "lucide-react";
import { CleanupPanel, useCleanup } from "@/components/Cleanup";
import PlaceCard, { eventTiming } from "@/components/PlaceCard";
import { api } from "@/lib/client";
import { getSupabase } from "@/lib/supabase";
import { CATEGORIES, isTemporary, type Place, type PlaceStatus } from "@/lib/types";

const TABS: { value: PlaceStatus | "all"; label: string }[] = [
  { value: "want", label: "가고 싶음" },
  { value: "visited", label: "다녀옴" },
  { value: "skip", label: "제외" },
  { value: "all", label: "전체" },
];

const SORTS = {
  recent: { label: "최근 저장순", compare: (a: Place, b: Place) => b.updated_at.localeCompare(a.updated_at) },
  stars: { label: "많이 저장한 순", compare: (a: Place, b: Place) => b.save_count - a.save_count || b.updated_at.localeCompare(a.updated_at) },
  closing: {
    label: "마감 임박 행사 먼저",
    // Running/upcoming events by end date first, then everything else; ended events last.
    compare: (a: Place, b: Place) => closingRank(a) - closingRank(b) || (a.end_date ?? "9999").localeCompare(b.end_date ?? "9999"),
  },
};

function closingRank(p: Place) {
  if (!isTemporary(p.kind)) return 1;
  return eventTiming(p).ended ? 2 : 0;
}

const fetchPlaces = () =>
  getSupabase()
    .from("places")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(2000)
    .then(({ data }) => (data as Place[]) ?? []);

export default function PlacesPage() {
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [tab, setTab] = useState<PlaceStatus | "all">("want");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<keyof typeof SORTS>("recent");
  const [query, setQuery] = useState("");

  const reload = useCallback(() => fetchPlaces().then(setPlaces), []);
  const cleanup = useCleanup(reload);

  useEffect(() => {
    let active = true;
    fetchPlaces().then((data) => active && setPlaces(data));
    return () => {
      active = false;
    };
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (places ?? [])
      .filter(
        (p) =>
          (tab === "all" || p.status === tab) &&
          (!category || p.category === category) &&
          (!q || [p.name, p.area, p.address, p.summary, ...(p.tags ?? []), ...(p.good_for ?? [])].join(" ").toLowerCase().includes(q)),
      )
      .sort(SORTS[sort].compare);
  }, [places, tab, category, sort, query]);

  async function setStatus(id: string, status: PlaceStatus) {
    setPlaces((ps) => ps!.map((p) => (p.id === id ? { ...p, status } : p)));
    await getSupabase().from("places").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  }

  async function remove(id: string) {
    if (!confirm("이 장소를 삭제할까요?")) return;
    setPlaces((ps) => ps!.filter((p) => p.id !== id));
    await getSupabase().from("places").delete().eq("id", id);
  }

  async function refreshOne(id: string) {
    try {
      await api("/api/places/refresh", { id });
      const { data } = await getSupabase().from("places").select("*").eq("id", id).single();
      if (data) setPlaces((ps) => ps!.map((p) => (p.id === id ? (data as Place) : p)));
    } catch (e) {
      alert(e instanceof Error ? e.message : "정보를 새로고침하지 못했어요.");
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div className="space-y-1.5">
          <p className="eyebrow">Library</p>
          <h1 className="text-2xl font-bold tracking-tight">내 장소</h1>
        </div>
        <div className="flex items-center gap-2">
          {places && (
            <span className="rounded-md border border-line bg-surface px-2 py-1 font-mono text-[11px] text-fg-2">
              {shown.length} / {places.length}
            </span>
          )}
          <button className="btn-secondary px-3 py-1.5 text-xs" onClick={cleanup.run} disabled={cleanup.running || !places?.length}>
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            정리하기
          </button>
        </div>
      </header>

      {cleanup.state.phase === "idle" ? (
        <p className="text-xs leading-relaxed text-fg-3">
          [정리하기]는 같은 장소를 하나로 합치고(합친 만큼 별이 늘어요), 설명을 원본 게시물과 최근 후기로 보강하고, 팝업·전시 같은 행사의 운영 기간을 확인해요.
        </p>
      ) : (
        <CleanupPanel state={cleanup.state} />
      )}

      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-fg-3" />
          <input className="input pl-9" placeholder="이름·지역·태그로 검색 (예: 성수, 루프탑)" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select className="input py-2" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">모든 종류</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select className="input py-2" value={sort} onChange={(e) => setSort(e.target.value as keyof typeof SORTS)}>
            {Object.entries(SORTS).map(([value, s]) => (
              <option key={value} value={value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
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

      {places === null ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-36 animate-pulse" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-12 text-center text-sm text-fg-3">
          <Layers className="h-6 w-6" />
          {places.length ? "조건에 맞는 장소가 없어요." : "아직 저장된 장소가 없어요. '취향 더하기'나 '가져오기'를 이용해 보세요."}
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((p) => (
            <PlaceCard
              key={p.id}
              place={p}
              onStatus={(s) => setStatus(p.id, s)}
              onDelete={() => remove(p.id)}
              onRefresh={() => refreshOne(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
