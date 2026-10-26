"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";

const CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

const SessionContext = createContext<Session | null>(null);
export const useSession = () => useContext(SessionContext)!;

const NAV = [
  { href: "/", label: "홈" },
  { href: "/places", label: "내 장소" },
  { href: "/recommend", label: "약속 추천" },
  { href: "/import", label: "가져오기" },
];

export default function AppShell({ children }: { children: ReactNode }) {
  // undefined = still checking, null = signed out
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const pathname = usePathname();

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (!CONFIGURED) return;
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 pb-16">
      <header className="sticky top-0 z-10 -mx-4 mb-4 border-b border-zinc-200 bg-white/90 px-4 backdrop-blur">
        <div className="flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold">
            <span className="inline-block h-6 w-6 rounded-lg bg-brand text-center text-sm leading-6 text-white">📍</span>
            핫플비서
          </Link>
          {session && (
            <button className="text-xs text-zinc-500" onClick={() => getSupabase().auth.signOut()}>
              로그아웃
            </button>
          )}
        </div>
        {session && (
          <nav className="flex gap-1 overflow-x-auto pb-2">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap ${
                  pathname === n.href ? "bg-brand text-white" : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className="flex-1">
        {!CONFIGURED ? (
          <p className="py-20 text-center text-sm text-red-600">
            Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)가 설정되지 않았어요.
          </p>
        ) : session === undefined ? (
          <p className="py-20 text-center text-sm text-zinc-400">불러오는 중…</p>
        ) : session === null ? (
          <Login />
        ) : (
          <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
        )}
      </main>
    </div>
  );
}

const AUTH_ERRORS: Record<string, string> = {
  "Invalid login credentials": "이메일 또는 비밀번호가 올바르지 않습니다.",
  "User already registered": "이미 가입된 이메일입니다. 로그인해 주세요.",
  "Email not confirmed": "이메일 인증이 아직 완료되지 않았습니다.",
};

function Login() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const auth = getSupabase().auth;
    const { data, error } =
      mode === "login"
        ? await auth.signInWithPassword({ email, password })
        : await auth.signUp({ email, password });
    setBusy(false);
    if (error) setMessage(AUTH_ERRORS[error.message] ?? error.message);
    else if (mode === "signup" && !data.session) setMessage("가입 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.");
  }

  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="text-2xl font-bold">SNS에서 본 핫플,<br />약속 잡을 때 꺼내 쓰세요</h1>
      <p className="mt-2 text-sm text-zinc-500">
        인스타·유튜브·지도 앱에서 본 장소를 모아 두면, 약속 지역·시간·목적에 맞는 곳을 골라 드려요.
      </p>
      <form onSubmit={submit} className="card mt-6 space-y-3">
        <input className="input" type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          className="input"
          type="password"
          placeholder="비밀번호 (6자 이상)"
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "잠시만요…" : mode === "login" ? "로그인" : "가입하기"}
        </button>
        {message && <p className="text-sm text-brand-dark">{message}</p>}
        <button
          type="button"
          className="w-full text-center text-sm text-zinc-500"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
        >
          {mode === "login" ? "처음이신가요? 가입하기" : "이미 계정이 있어요. 로그인"}
        </button>
      </form>
    </div>
  );
}
