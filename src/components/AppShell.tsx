"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { House, Layers, LoaderCircle, LogOut, MapPin, Sparkles, Upload, type LucideIcon } from "lucide-react";
import { getSupabase } from "@/lib/supabase";

const CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

const SessionContext = createContext<Session | null>(null);
export const useSession = () => useContext(SessionContext)!;

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "홈", icon: House },
  { href: "/places", label: "내 장소", icon: Layers },
  { href: "/recommend", label: "추천", icon: Sparkles },
  { href: "/import", label: "가져오기", icon: Upload },
];

export function Logo() {
  return (
    <span className="brand-gradient glow grid h-7 w-7 place-items-center rounded-lg">
      <MapPin className="h-4 w-4 text-white" strokeWidth={2.5} />
    </span>
  );
}

/** Dot grid plus a sky-blue glow at the top, fixed behind every page. */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,black,transparent)] bg-[radial-gradient(rgb(255_255_255/0.07)_1px,transparent_1px)] [background-size:22px_22px]" />
      <div className="absolute top-[-280px] left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(56_189_248/0.16),transparent)]" />
    </div>
  );
}

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
    <>
      <Backdrop />
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/75 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <Logo />
            핫플비서
          </Link>
          {session && (
            <button
              className="inline-flex items-center gap-1.5 text-xs text-fg-3 transition hover:text-fg"
              onClick={() => getSupabase().auth.signOut()}
            >
              <LogOut className="h-3.5 w-3.5" />
              로그아웃
            </button>
          )}
        </div>
        {session && (
          <nav className="mx-auto max-w-3xl px-4 pb-3">
            <div className="grid grid-cols-4 gap-1 rounded-xl border border-line bg-surface p-1">
              {NAV.map(({ href, label, icon: Icon }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm transition ${
                      active
                        ? "bg-surface-3 font-medium text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)]"
                        : "text-fg-2 hover:text-fg"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? "text-accent" : ""}`} />
                    {label}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-6 pb-20">
        {!CONFIGURED ? (
          <p className="card border-danger-line bg-danger-bg py-10 text-center text-sm text-danger">
            Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)가 설정되지 않았어요.
          </p>
        ) : session === undefined ? (
          <div className="flex justify-center py-24 text-fg-3">
            <LoaderCircle className="h-6 w-6 animate-spin" />
          </div>
        ) : session === null ? (
          <Landing />
        ) : (
          <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
        )}
      </main>
    </>
  );
}

const FEATURES = [
  { step: "01", label: "Collect", title: "공유 한 번으로 저장", body: "인스타·유튜브·지도 앱에서 본 곳을 링크나 스크린샷으로 바로 저장해요." },
  { step: "02", label: "Organize", title: "AI가 알아서 정리", body: "장소명·지역·영업시간·팝업 기간·분위기를 뽑아 나만의 DB로 쌓아요." },
  { step: "03", label: "Recommend", title: "약속에 딱 맞게 추천", body: "지역·날짜·목적·동행인을 입력하면 저장한 곳 중에서 골라 드려요." },
];

function Landing() {
  return (
    <div className="space-y-12 pt-6">
      <section className="space-y-5 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1 font-mono text-[11px] tracking-wider text-fg-2">
          <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_8px_var(--color-success)]" />
          YOUR HOTPLACE ASSISTANT
        </span>
        <h1 className="text-[34px] leading-[1.15] font-bold tracking-tight sm:text-5xl">
          SNS에서 스쳐 간 핫플,
          <br />
          <span className="text-gradient">
            약속 잡을 때 꺼내 쓰세요
          </span>
        </h1>
        <p className="mx-auto max-w-md text-[15px] leading-relaxed text-fg-2">
          가고 싶은 곳을 대신 기억해 두었다가, 약속이 생기면 지역·시간·목적·동행인에 맞는 곳을 골라 주는 비서예요.
        </p>
      </section>

      <AuthCard />

      <section className="grid gap-3 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.step} className="card space-y-2">
            <p className="eyebrow">
              {f.step} · {f.label}
            </p>
            <h3 className="font-semibold tracking-tight">{f.title}</h3>
            <p className="text-sm leading-relaxed text-fg-2">{f.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

const AUTH_ERRORS: Record<string, string> = {
  "Invalid login credentials": "이메일 또는 비밀번호가 올바르지 않습니다.",
  "User already registered": "이미 가입된 이메일입니다. 로그인해 주세요.",
  "Email not confirmed": "이메일 인증이 아직 완료되지 않았습니다.",
};

function AuthCard() {
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
    <form onSubmit={submit} className="card mx-auto max-w-sm space-y-4 p-5">
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-canvas p-1">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setMessage("");
            }}
            className={`rounded-md py-1.5 text-sm transition ${mode === m ? "bg-surface-3 font-medium text-fg" : "text-fg-3 hover:text-fg-2"}`}
          >
            {m === "login" ? "로그인" : "가입하기"}
          </button>
        ))}
      </div>
      <div className="space-y-2">
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
      </div>
      <button className="btn-primary w-full" disabled={busy}>
        {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
        {mode === "login" ? "로그인" : "가입하고 시작하기"}
      </button>
      {message && <p className="text-sm text-danger">{message}</p>}
    </form>
  );
}
