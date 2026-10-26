import { authenticate, jsonError } from "@/lib/server/auth";
import { MIGRATION_HINT } from "@/lib/server/dedupe";
import { refreshPlace } from "@/lib/server/process";
import type { Place, RefreshResult } from "@/lib/types";

export const maxDuration = 300;

const BATCH = 4;

/**
 * Rewrites descriptions (and confirms event periods) for places not enriched yet, a few per call;
 * the client calls again until `remaining` is 0. With `{ id }`, refreshes that one place.
 */
export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (!auth) return jsonError("로그인이 필요합니다.", 401);
  const { supabase } = auth;
  const body = (await request.json().catch(() => ({}))) as { id?: string };

  const query = supabase.from("places").select("*");
  const { data, error } = body.id
    ? await query.eq("id", body.id)
    : await query.is("enriched_at", null).order("save_count", { ascending: false }).order("created_at").limit(BATCH);
  if (error) return jsonError(error.code === "42703" ? MIGRATION_HINT : error.message, 500);

  const places = data as Place[];
  const settled = await Promise.allSettled(places.map((p) => refreshPlace(supabase, p)));
  const done = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  // A place that keeps failing (e.g. refused) is marked as handled so the batch loop can finish.
  const failedIds = places.filter((_, i) => settled[i].status === "rejected").map((p) => p.id);
  if (failedIds.length) await supabase.from("places").update({ enriched_at: new Date().toISOString() }).in("id", failedIds);
  if (body.id && failedIds.length) return jsonError("장소 정보를 보강하지 못했어요. 잠시 후 다시 시도해 주세요.", 500);

  const { count } = await supabase.from("places").select("id", { count: "exact", head: true }).is("enriched_at", null);
  return Response.json({
    checked: done.length,
    failed: failedIds.length,
    remaining: count ?? 0,
    searched: done.every((r) => r.searched),
    names: done.map((r) => r.place.name),
  } satisfies RefreshResult);
}
