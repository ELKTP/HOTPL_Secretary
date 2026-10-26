import { after } from "next/server";
import { authenticate, jsonError } from "@/lib/server/auth";
import { processItem } from "@/lib/server/process";
import type { ImageInput, Item } from "@/lib/types";

export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/items/[id]/retry">) {
  const auth = await authenticate(request);
  if (!auth) return jsonError("로그인이 필요합니다.", 401);
  const { supabase } = auth;
  const { id } = await ctx.params;

  const body = (await request.json()) as { extraText?: string; images?: ImageInput[] };
  const { data: item, error } = await supabase
    .from("items")
    .update({
      status: "pending",
      note: null,
      ...(body.extraText?.trim() ? { extra_text: body.extraText.trim() } : {}),
    })
    .eq("id", id)
    .select()
    .single();
  if (error || !item) return jsonError("항목을 찾을 수 없습니다.", 404);

  after(() => processItem(supabase, item as Item, (body.images ?? []).slice(0, 5)));
  return Response.json({ id, status: "pending" });
}
