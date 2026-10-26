import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImageInput, Item, Place } from "@/lib/types";
import { extractPlaces, type ExtractedPlace } from "./claude";
import { fetchContent } from "./content";

const normalize = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "").toLowerCase();

/** Same place if names match ignoring spaces and the areas don't contradict each other. */
function isSamePlace(existing: Place, p: ExtractedPlace) {
  if (normalize(existing.name) !== normalize(p.name)) return false;
  const a = normalize(existing.area);
  const b = normalize(p.area);
  return !a || !b || a.includes(b) || b.includes(a) || a.slice(0, 4) === b.slice(0, 4);
}

async function savePlace(supabase: SupabaseClient, item: Item, p: ExtractedPlace) {
  const { data: candidates } = await supabase
    .from("places")
    .select("*")
    .ilike("name", `%${p.name.replace(/[%_]/g, "").replace(/\s+/g, "%")}%`)
    .limit(20);
  const existing = (candidates as Place[] | null)?.find((c) => isSamePlace(c, p));

  if (existing) {
    await supabase
      .from("places")
      .update({
        save_count: existing.save_count + 1,
        tags: Array.from(new Set([...existing.tags, ...p.tags])),
        good_for: Array.from(new Set([...existing.good_for, ...p.good_for])),
        address: existing.address ?? p.address,
        hours: existing.hours ?? p.hours,
        price: existing.price ?? p.price,
        start_date: p.start_date ?? existing.start_date,
        end_date: p.end_date ?? existing.end_date,
        summary: existing.summary ?? p.summary,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return;
  }

  const { error } = await supabase.from("places").insert({
    user_id: item.user_id,
    item_id: item.id,
    ...p,
    source_url: item.url,
  });
  if (error) throw new Error(`장소 저장 실패: ${error.message}`);
}

/** Gathers the item's text, asks Claude for places, saves them, and records the outcome on the item. */
export async function processItem(supabase: SupabaseClient, item: Item, images: ImageInput[] = []) {
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
    for (const p of places) await savePlace(supabase, item, p);

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
