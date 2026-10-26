import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { isTemporary, type Place } from "@/lib/types";
import { judgeDuplicates, type DedupeCandidate } from "./claude";

// Deciding whether two saved entries are the same place.
// Cheap rules settle the clear cases; only ambiguous pairs go to Claude.
// Time-limited events (pop-ups, exhibitions, shows, festivals) count as the same
// only when the event and its period match, even at the same address.

type Comparable = Pick<Place, "name" | "category" | "kind" | "area" | "address" | "start_date" | "end_date" | "summary">;

interface Facts {
  core: string;
  areas: string[];
  addr: string;
  temporary: boolean;
  start: string | null;
  end: string | null;
}

const CITY =
  /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|제주|충북|충남|전북|전남|경북|경남|충청북|충청남|전라북|전라남|경상북|경상남)(특별시|광역시|특별자치시|특별자치도|도|시)?$/;

/** Name without spaces, punctuation or bracketed notes: "카페 어니언 (성수)" -> "카페어니언". */
export function coreName(name: string) {
  return name
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/[^0-9a-z가-힣]/g, "");
}

/** District-level tokens of an area, ignoring the city and 시/구/동/역 suffixes: "서울 성동구 성수동" -> ["성동", "성수"]. */
function areaKeys(area: string | null) {
  return (area ?? "")
    .split(/[\s,·/]+/)
    .map((t) => t.replace(/[^0-9a-z가-힣]/gi, ""))
    .filter((t) => t && !CITY.test(t))
    .map((t) => t.replace(/(특별시|광역시|시|구|군|동|읍|면|역)$/, ""))
    .filter((t) => t.length >= 2);
}

/** Street address without floor/unit details, for exact comparison. */
function addressKey(address: string | null) {
  const key = (address ?? "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s(지하\s?)?\d+\s?층.*$|\s[bB]?\d+[fF].*$/, "")
    .replace(/[^0-9a-z가-힣]/gi, "")
    .toLowerCase();
  return key.length >= 8 ? key : "";
}

export function facts(p: Comparable): Facts {
  return {
    core: coreName(p.name),
    areas: areaKeys(p.area ?? p.address),
    addr: addressKey(p.address),
    temporary: isTemporary(p.kind),
    start: p.start_date,
    end: p.end_date,
  };
}

const areasCompatible = (a: Facts, b: Facts) => !a.areas.length || !b.areas.length || a.areas.some((t) => b.areas.includes(t));

/** true/false when both periods are known, null when either side has no dates. */
function samePeriod(a: Facts, b: Facts) {
  if (!(a.start || a.end) || !(b.start || b.end)) return null;
  const compatible = (x: string | null, y: string | null) => !x || !y || x === y;
  const anyEqual = (a.start && a.start === b.start) || (a.end && a.end === b.end);
  return compatible(a.start, b.start) && compatible(a.end, b.end) && !!anyEqual;
}

const GENERIC_WORDS = /^(카페|cafe|커피|coffee|베이커리|bakery|레스토랑|restaurant|식당|bar|바|펍|pub|다이닝|본점|지점|점)+$/;

/**
 * True when the longer name is the shorter one plus only a branch/area word or a generic
 * business word: "어니언" vs "어니언 성수(점)" in 성수, or "카페 어니언".
 */
function onlyBranchOrGenericDiff(a: Facts, b: Facts) {
  const [short, long] = a.core.length <= b.core.length ? [a.core, b.core] : [b.core, a.core];
  const extra = long.replace(short, "").replace(/(본점|지점|점)$/, "");
  if (!extra) return true;
  if (GENERIC_WORDS.test(extra)) return a.areas.length > 0 && b.areas.length > 0;
  return [...a.areas, ...b.areas].includes(extra);
}

export type Decision = "same" | "different" | "ask";

export function quickDecision(a: Facts, b: Facts): Decision {
  const nameEqual = a.core === b.core && a.core.length > 0;
  // Containment ("어니언" in "어니언성수점") is a hint only when the shorter name isn't trivially short.
  const nameNear =
    !nameEqual && Math.min(a.core.length, b.core.length) >= 3 && (a.core.includes(b.core) || b.core.includes(a.core));
  const areaOk = areasCompatible(a, b);
  const addrEqual = !!a.addr && a.addr === b.addr;

  // A permanent store and a pop-up are different, unless the names are identical.
  if (a.temporary !== b.temporary) return nameEqual && areaOk ? "ask" : "different";

  if (!a.temporary) {
    if (nameEqual && areaOk) return "same";
    if (nameNear && areaOk && onlyBranchOrGenericDiff(a, b)) return "same";
    if ((nameNear && areaOk) || addrEqual) return "ask";
    return "different";
  }

  // Both are events: same address alone never makes them the same event.
  if ((nameEqual || nameNear) && areaOk) {
    const period = samePeriod(a, b);
    if (period === false) return "different";
    return nameEqual && period ? "same" : "ask";
  }
  return "different";
}

const toCandidate = (key: string, p: Comparable): DedupeCandidate => ({
  key,
  name: p.name,
  category: p.category,
  kind: p.kind,
  area: p.area,
  address: p.address,
  start_date: p.start_date,
  end_date: p.end_date,
  summary: p.summary,
});

/** Groups the user's places into sets that refer to the same place or event (only sets of 2+). */
export async function findDuplicateGroups(places: Place[]): Promise<Place[][]> {
  const f = places.map(facts);
  const parent = places.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (i: number, j: number) => {
    parent[find(i)] = find(j);
  };

  const askEdges: [number, number][] = [];
  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      const d = quickDecision(f[i], f[j]);
      if (d === "same") union(i, j);
      else if (d === "ask") askEdges.push([i, j]);
    }
  }

  // Ambiguous pairs: connect the already-merged groups they touch, then let Claude split each cluster.
  const clusterOf = new Map<number, Set<number>>();
  for (const [i, j] of askEdges) {
    const a = find(i);
    const b = find(j);
    if (a === b) continue;
    const merged = new Set([...(clusterOf.get(a) ?? [a]), ...(clusterOf.get(b) ?? [b])]);
    for (const root of merged) clusterOf.set(root, merged);
  }
  // Keep each cluster small enough for one careful comparison.
  const clusters = [...new Set(clusterOf.values())].flatMap((s) => {
    const roots = [...s];
    return Array.from({ length: Math.ceil(roots.length / 15) }, (_, k) => roots.slice(k * 15, k * 15 + 15)).filter((c) => c.length > 1);
  });

  for (let start = 0; start < clusters.length; start += 25) {
    const batch = clusters.slice(start, start + 25);
    const groups = await judgeDuplicates(batch.map((roots) => roots.map((r) => toCandidate(`k${r}`, places[r]))));
    for (const keys of groups) {
      const roots = keys.map((k) => Number(k.slice(1))).filter((r) => Number.isInteger(r) && places[r]);
      // Accept a group only if all its members came from the same cluster.
      if (roots.length >= 2 && batch.some((c) => roots.every((r) => c.includes(r)))) {
        roots.slice(1).forEach((r) => union(roots[0], r));
      }
    }
  }

  const byRoot = new Map<number, Place[]>();
  places.forEach((p, i) => byRoot.set(find(i), [...(byRoot.get(find(i)) ?? []), p]));
  return [...byRoot.values()].filter((g) => g.length > 1);
}

/** The existing place a newly extracted one duplicates, if any. */
export async function findMatch(existing: Place[], candidate: Comparable): Promise<Place | null> {
  const f = facts(candidate);
  const decided = existing.map((e) => ({ e, d: quickDecision(facts(e), f) }));
  const same = decided.find((x) => x.d === "same");
  if (same) return same.e;

  const ask = decided.filter((x) => x.d === "ask").slice(0, 8);
  if (!ask.length) return null;
  const groups = await judgeDuplicates([[toCandidate("new", candidate), ...ask.map((x, i) => toCandidate(`e${i}`, x.e))]]);
  const key = groups.find((g) => g.includes("new"))?.find((k) => k !== "new");
  return key ? (ask[Number(key.slice(1))]?.e ?? null) : null;
}

// ---------- merging ----------

const uniq = <T>(xs: (T | null | undefined)[]) => [...new Set(xs.filter((x): x is T => x !== null && x !== undefined && x !== ""))];

/** Field values for the surviving row when `others` are folded into `primary`. */
export function mergedFields(primary: Place, others: Place[]) {
  const all = [primary, ...others];
  const first = <K extends keyof Place>(k: K) => all.map((p) => p[k]).find((v) => v !== null && v !== undefined && v !== "") ?? null;
  const verified = all.find((p) => p.period_status === "verified");
  const longestSummary = all.map((p) => p.summary ?? "").sort((a, b) => b.length - a.length)[0] || null;
  return {
    save_count: all.reduce((sum, p) => sum + (p.save_count || 1), 0),
    tags: uniq(all.flatMap((p) => p.tags ?? [])).slice(0, 12),
    good_for: uniq(all.flatMap((p) => p.good_for ?? [])),
    sources: uniq(all.flatMap((p) => [...(p.sources ?? []), p.source_url])),
    source_url: first("source_url"),
    area: first("area"),
    address: first("address"),
    hours: first("hours"),
    price: first("price"),
    // Interim description; enriched_at is cleared so the cleanup pass rewrites it from all sources.
    summary: longestSummary,
    enriched_at: null,
    memo: uniq(all.map((p) => p.memo)).join(" / ") || null,
    status: all.some((p) => p.status === "visited") ? "visited" : primary.status,
    start_date: verified?.start_date ?? first("start_date"),
    end_date: verified?.end_date ?? first("end_date"),
    period_status: verified ? "verified" : primary.period_status,
    period_note: verified?.period_note ?? first("period_note"),
    period_source: verified?.period_source ?? first("period_source"),
    updated_at: new Date().toISOString(),
  };
}

export const MIGRATION_HINT =
  "DB 업데이트가 필요해요. Supabase SQL Editor에서 supabase/migrations/002_dedupe_events.sql 내용을 실행해 주세요.";

/** Turns a Supabase error into a readable message, pointing at the migration when columns are missing. */
export function dbError(error: PostgrestError, what: string) {
  const missingColumn = error.code === "PGRST204" || error.code === "42703";
  return new Error(missingColumn ? MIGRATION_HINT : `${what}: ${error.message}`);
}

/** Keeps the oldest entry of a group, folds the rest into it, and deletes them. Returns the survivor. */
export async function mergeGroup(supabase: SupabaseClient, group: Place[]): Promise<Place> {
  const [primary, ...others] = [...group].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const fields = mergedFields(primary, others);
  const { error } = await supabase.from("places").update(fields).eq("id", primary.id);
  if (error) throw dbError(error, "장소 합치기 실패");
  const ids = others.map((p) => p.id).filter(Boolean);
  if (ids.length) {
    const { error: delError } = await supabase.from("places").delete().in("id", ids);
    if (delError) throw dbError(delError, "중복 삭제 실패");
  }
  return { ...primary, ...fields } as Place;
}
