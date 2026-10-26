import { authenticate, jsonError } from "@/lib/server/auth";
import { findDuplicateGroups, mergeGroup } from "@/lib/server/dedupe";
import type { DedupeResult, Place } from "@/lib/types";

export const maxDuration = 300;

/** Merges every set of entries that refer to the same place (or the same event and period). */
export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (!auth) return jsonError("로그인이 필요합니다.", 401);

  const { data, error } = await auth.supabase.from("places").select("*").limit(5000);
  if (error) return jsonError(error.message, 500);
  const places = data as Place[];

  try {
    const groups = await findDuplicateGroups(places);
    const merged: DedupeResult["groups"] = [];
    for (const group of groups) {
      const survivor = await mergeGroup(auth.supabase, group);
      merged.push({ name: survivor.name, count: group.length });
    }
    const removed = groups.reduce((sum, g) => sum + g.length - 1, 0);
    return Response.json({ before: places.length, after: places.length - removed, groups: merged } satisfies DedupeResult);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "중복 정리 중 오류가 발생했습니다.", 500);
  }
}
