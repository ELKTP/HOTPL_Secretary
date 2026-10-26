import type { SupabaseClient } from "@supabase/supabase-js";
import { isTemporary, type ImageInput, type Item, type Place } from "@/lib/types";
import { extractPlaces, refreshPlaceInfo, type ExtractedPlace } from "./claude";
import { detectSource, fetchContent } from "./content";
import { dbError, facts, findMatch, mergedFields, quickDecision } from "./dedupe";

/** Text of the posts a place came from: the saved share text plus re-fetched source links. */
async function sourceTextFor(supabase: SupabaseClient, place: Place) {
  const parts: string[] = [];
  if (place.item_id) {
    const { data: item } = await supabase.from("items").select("shared_text,extra_text").eq("id", place.item_id).maybeSingle();
    if (item?.shared_text) parts.push(item.shared_text);
    if (item?.extra_text) parts.push(item.extra_text);
  }
  const urls = [...new Set([...(place.sources ?? []), place.source_url].filter((u): u is string => !!u))].slice(0, 3);
  const fetched = await Promise.all(urls.map((u) => fetchContent(u, detectSource(u))));
  fetched.forEach((text, i) => text && parts.push(`[${urls[i]}]\n${text}`));
  return parts.join("\n\n").slice(0, 12000);
}

/**
 * Rewrites the description from source posts and web research, and for events confirms the period.
 * Returns whether the web search ran.
 */
export async function refreshPlace(supabase: SupabaseClient, place: Place) {
  const info = await refreshPlaceInfo({ ...place, tags: place.tags ?? [] }, await sourceTextFor(supabase, place));
  const event = isTemporary(place.kind);
  const update = {
    summary: info.summary,
    tags: [...new Set([...(place.tags ?? []), ...info.tags])].slice(0, 12),
    hours: place.hours ?? info.hours,
    price: place.price ?? info.price,
    address: place.address ?? info.address,
    enriched_at: new Date().toISOString(),
    ...(event && info.period.found
      ? {
          period_status: "verified",
          start_date: info.period.start_date ?? place.start_date,
          end_date: info.period.end_date ?? place.end_date,
          period_note: info.period.schedule ?? place.period_note,
          period_source: info.period.source_url,
        }
      : {}),
    // Searched but found nothing: mark as checked. Search unavailable: leave "unverified" to retry later.
    ...(event && !info.period.found && info.searched ? { period_status: "not_found" } : {}),
  };
  const { error } = await supabase.from("places").update(update).eq("id", place.id);
  if (error) throw dbError(error, "장소 정보 저장 실패");
  return { place: { ...place, ...update } as Place, searched: info.searched };
}

async function loadPlaces(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("places").select("*").limit(5000);
  if (error) throw dbError(error, "장소 목록 조회 실패");
  return data as Place[];
}

/**
 * Two saves of the same place can run at once (bulk import). After inserting, look for a
 * twin created in the last few minutes; the newer row folds into the older one.
 */
async function settleRace(supabase: SupabaseClient, inserted: Place): Promise<Place> {
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data } = await supabase.from("places").select("*").gte("created_at", since).neq("id", inserted.id);
  const f = facts(inserted);
  const older = (data as Place[] | null)
    ?.filter((p) => p.created_at <= inserted.created_at && quickDecision(facts(p), f) === "same")
    .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  if (!older) return inserted;
  const fields = mergedFields(older, [inserted]);
  await supabase.from("places").update(fields).eq("id", older.id);
  await supabase.from("places").delete().eq("id", inserted.id);
  return { ...older, ...fields } as Place;
}

/** Adds a place, or bumps the existing entry it duplicates (one more star). Returns the stored row. */
async function savePlace(supabase: SupabaseClient, existing: Place[], item: Item, p: ExtractedPlace): Promise<Place> {
  const row = {
    ...p,
    user_id: item.user_id,
    item_id: item.id,
    source_url: item.url,
    sources: item.url ? [item.url] : [],
    save_count: 1,
    period_status: isTemporary(p.kind) ? "unverified" : "none",
  };
  const match = await findMatch(existing, row);

  if (match) {
    const fields = mergedFields(match, [row as unknown as Place]);
    const { error } = await supabase.from("places").update(fields).eq("id", match.id);
    if (error) throw dbError(error, "장소 업데이트 실패");
    const merged = { ...match, ...fields } as Place;
    existing.splice(existing.indexOf(match), 1, merged);
    return merged;
  }

  const { data, error } = await supabase.from("places").insert(row).select().single();
  if (error || !data) throw dbError(error!, "장소 저장 실패");
  const saved = await settleRace(supabase, data as Place);
  existing.push(saved);
  return saved;
}

/**
 * Gathers the item's text, asks Claude for places, saves them, and records the outcome on the item.
 * With `enrich`, each saved place is also researched on the web right away (single shares);
 * bulk imports skip it and let the cleanup pass enrich after duplicates are merged.
 */
export async function processItem(
  supabase: SupabaseClient,
  item: Item,
  images: ImageInput[] = [],
  { enrich = true }: { enrich?: boolean } = {},
) {
  try {
    const parts: string[] = [];
    if (item.shared_text) parts.push(`[공유된 텍스트]\n${item.shared_text}`);
    if (item.extra_text) parts.push(`[사용자가 보충한 내용]\n${item.extra_text}`);
    if (item.url) {
      const fetched = await fetchContent(item.url, item.source);
      if (fetched) parts.push(`[링크에서 가져온 내용]\n${fetched}`);
      parts.push(`[링크] ${item.url}`);
    }

    const result = await extractPlaces(parts.join("\n\n"), images);
    const places = result.status === "places" ? result.places.filter((p) => p.name.trim()) : [];
    if (places.length) {
      const existing = await loadPlaces(supabase);
      for (const p of places) {
        const saved = await savePlace(supabase, existing, item, p);
        if (enrich) await refreshPlace(supabase, saved).catch(() => {});
      }
    }

    await supabase
      .from("items")
      .update({
        status: places.length ? "done" : result.status === "places" ? "no_place" : result.status,
        note: result.note,
        place_count: places.length,
      })
      .eq("id", item.id);
    return { status: places.length ? "done" : result.status, note: result.note, count: places.length };
  } catch (e) {
    const note = e instanceof Error ? e.message : "알 수 없는 오류";
    await supabase.from("items").update({ status: "error", note }).eq("id", item.id);
    return { status: "error", note, count: 0 };
  }
}
