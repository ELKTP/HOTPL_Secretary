import { after } from "next/server";
import { authenticate, jsonError } from "@/lib/server/auth";
import { detectSource, findUrl } from "@/lib/server/content";
import { processItem } from "@/lib/server/process";
import type { ImageInput, Item } from "@/lib/types";

export const maxDuration = 300;

interface Body {
  text?: string;
  url?: string;
  title?: string;
  images?: ImageInput[];
  /** true: analyze before responding (bulk import). false: respond right away (sharing). */
  wait?: boolean;
}

export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (!auth) return jsonError("로그인이 필요합니다.", 401);
  const { supabase, user } = auth;

  const body = (await request.json()) as Body;
  const images = (body.images ?? []).slice(0, 5);
  const sharedText = [body.title, body.text].filter(Boolean).join("\n").trim() || null;
  const url = body.url?.trim() || findUrl(sharedText);
  if (!sharedText && !url && !images.length) return jsonError("저장할 내용이 없습니다.", 400);

  if (url) {
    const { data: dup } = await supabase
      .from("items")
      .select("id,status,place_count")
      .eq("url", url)
      .in("status", ["done", "no_place", "pending"])
      .limit(1)
      .maybeSingle();
    if (dup) return Response.json({ id: dup.id, duplicate: true, status: dup.status, count: dup.place_count });
  }

  const { data: item, error } = await supabase
    .from("items")
    .insert({
      user_id: user.id,
      source: url ? detectSource(url) : images.length ? "image" : "text",
      url,
      shared_text: sharedText,
    })
    .select()
    .single();
  if (error || !item) return jsonError(`저장 실패: ${error?.message}`, 500);

  if (body.wait) {
    // Bulk import: skip web enrichment here; the cleanup pass enriches after merging duplicates.
    const result = await processItem(supabase, item as Item, images, { enrich: false });
    return Response.json({ id: item.id, ...result });
  }
  after(() => processItem(supabase, item as Item, images));
  return Response.json({ id: item.id, status: "pending" });
}
