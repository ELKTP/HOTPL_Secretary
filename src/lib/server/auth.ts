import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export interface AuthContext {
  supabase: SupabaseClient;
  user: User;
}

/**
 * Verifies the bearer token sent by the browser and returns a Supabase client
 * that acts as that user, so row level security limits every query to their rows.
 */
export async function authenticate(request: Request): Promise<AuthContext | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { supabase, user: data.user };
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
