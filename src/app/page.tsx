"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Lightbulb,
  LoaderCircle,
  Route,
  Sparkles,
  Sun,
  Umbrella,
} from "lucide-react";
import PlaceCard from "@/components/PlaceCard";
import { api } from "@/lib/client";
import { getSupabase } from "@/lib/supabase";
import type { RecommendInput, RecommendResult, WeatherSummary } from "@/lib/types";

const TIMES = ["오전", "점심", "오후", "저녁", "밤"];
const PURPOSES = ["데이트", "기념일", "소개팅", "친구 모임", "가족 나들이", "부모님과", "업무 미팅", "혼자"];
const COMPANIONS = ["연인", "친구", "가족", "부모님", "아이", "반려동물", "직장 동료"];

function todayLocal() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function WeatherIcon({ code, className }: { code: number; className: string }) {
  if (code <= 1) return <Sun className={className} />;
  if (code === 2) return <CloudSun className={className} />;
  if (code === 3) return <Cloud className={className} />;
  if (code === 45 || code === 48) return <CloudFog className={className} />;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return <CloudSnow className={className} />;
  if (code >= 95) return <CloudLightning className={className} />;
  return <CloudRain className={className} />;
}

function Chips({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          type="button"
          key={o}
          onClick={() => onToggle(o)}
          className={`chip ${
            selected.includes(o)
              ? "border-accent bg-accent-bg text-accent-hi"
              : "border-line bg-surface-2 text-fg-2 hover:border-line-strong"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="flex items-baseline justify-between gap-2 text-sm font-medium">
        {label}
        {hint && <span className="text-[11px] font-normal text-fg-3">{hint}</span>}
      </p>
      {children}
    </div>
  );
}

function WeatherCard({ weather }: { weather: WeatherSummary }) {
  return (
    <div className="card flex items-center gap-4">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-accent-deep bg-accent-bg text-accent">
        <WeatherIcon code={weather.code} className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px] text-fg-3">
          {weather.location} · {weather.date} 예보
        </p>
        <p className="text-[15px] font-semibold">
          {weather.label} <span className="font-normal text-fg-2">{weather.tempMin}° / {weather.tempMax}°</span>
        </p>
      </div>
      {weather.precipProbability !== null && (
        <span className="inline-flex items-center gap-1 text-sm text-fg-2">
          <Umbrella className="h-4 w-4" />
          {weather.precipProbability}%
        </span>
      )}
    </div>
  );
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export default function HomePage() {
  const [placeCount, setPlaceCount] = useState<number | null>(null);
  const [area, setArea] = useState("");
  const [date, setDate] = useState(todayLocal);
  const [people, setPeople] = useState("");
  const [times, setTimes] = useState<string[]>([]);
  const [timeNote, setTimeNote] = useState("");
  const [purposes, setPurposes] = useState<string[]>([]);
  const [purposeNote, setPurposeNote] = useState("");
  const [companions, setCompanions] = useState<string[]>([]);
  const [extra, setExtra] = useState("");
  const [course, setCourse] = useState(false);
  const [includeVisited, setIncludeVisited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RecommendResult | null>(null);

  useEffect(() => {
    getSupabase()
      .from("places")
      .select("id", { count: "exact", head: true })
      .then(({ count, error }) => !error && setPlaceCount(count));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    const input: RecommendInput = {
      area,
      date,
      time: [...times, timeNote].filter(Boolean).join(", "),
      purpose: [...purposes, purposeNote].filter(Boolean).join(", "),
      companions: [people && `총 ${people}명`, ...companions].filter(Boolean).join(", "),
      extra: [extra, course ? "식사·카페 등을 묶은 동선 코스로도 추천해 주세요." : ""].filter(Boolean).join("\n"),
      includeVisited,
      count: 5,
    };
    try {
      setResult(await api<RecommendResult>("/api/recommend", input));
    } catch (err) {
      setError(err instanceof Error ? err.message : "추천하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <p className="eyebrow">Recommend</p>
        <h1 className="text-2xl font-bold tracking-tight">이번 약속, 어디로 갈까요?</h1>
        <p className="text-sm text-fg-2">저장해 둔 장소 중에서 골라 드려요. 모든 항목은 선택이라 비워 둬도 괜찮아요.</p>
      </header>

      {placeCount === 0 && (
        <div className="card space-y-3 border-accent-deep">
          <p className="text-sm">
            아직 저장된 장소가 없어요. 먼저 그동안 모아 둔 핫플을 가져오거나, 하나씩 더해 주세요.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/import" className="btn-primary">
              가져오기
            </Link>
            <Link href="/add" className="btn-secondary">
              취향 더하기
            </Link>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="card space-y-5 p-5">
        <Field label="어디서 만나요?" hint="비워 두면 지역 무관">
          <input className="input" placeholder="예: 성수역, 강남, 연남동" value={area} onChange={(e) => setArea(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="날짜" hint="날씨 반영">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="인원">
            <input
              className="input"
              type="number"
              min={1}
              max={30}
              placeholder="미정"
              value={people}
              onChange={(e) => setPeople(e.target.value)}
            />
          </Field>
        </div>
        <Field label="시간">
          <Chips options={TIMES} selected={times} onToggle={(v) => setTimes(toggle(times, v))} />
          <input className="input" placeholder="직접 입력 (예: 오후 2시~6시)" value={timeNote} onChange={(e) => setTimeNote(e.target.value)} />
        </Field>
        <Field label="목적">
          <Chips options={PURPOSES} selected={purposes} onToggle={(v) => setPurposes(toggle(purposes, v))} />
          <input className="input" placeholder="직접 입력 (예: 오랜만에 만나는 대학 동기)" value={purposeNote} onChange={(e) => setPurposeNote(e.target.value)} />
        </Field>
        <Field label="누구와">
          <Chips options={COMPANIONS} selected={companions} onToggle={(v) => setCompanions(toggle(companions, v))} />
        </Field>
        <Field label="기타 조건">
          <input className="input" placeholder="예: 조용한 곳, 1인 2만원 이하, 실내, 주차 필요" value={extra} onChange={(e) => setExtra(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-4 border-t border-line pt-4 text-sm text-fg-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-primary" checked={course} onChange={(e) => setCourse(e.target.checked)} /> 코스로 추천
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-primary" checked={includeVisited} onChange={(e) => setIncludeVisited(e.target.checked)} /> 다녀온 곳도 포함
          </label>
        </div>
        <button className="btn-primary w-full py-3.5 text-[15px]" disabled={busy}>
          {busy ? <LoaderCircle className="h-4.5 w-4.5 animate-spin" /> : <Sparkles className="h-4.5 w-4.5" />}
          {busy ? "날씨 확인하고 고르는 중… (10~30초)" : "추천 받기"}
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>

      {result && (
        <section className="space-y-3">
          {result.weather ? (
            <WeatherCard weather={result.weather} />
          ) : (
            result.weatherNote && <p className="px-1 text-xs text-fg-3">{result.weatherNote}</p>
          )}
          <div className="rounded-xl bg-gradient-to-br from-accent/60 via-accent-deep/40 to-transparent p-px">
            <div className="space-y-2 rounded-[11px] bg-surface p-4">
              <p className="flex items-start gap-2 text-sm font-medium">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                {result.summary}
              </p>
              {result.course && (
                <p className="flex items-start gap-2 text-sm text-fg-2">
                  <Route className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  {result.course}
                </p>
              )}
            </div>
          </div>
          {result.picks.map((pick, i) => (
            <PlaceCard
              key={pick.place.id}
              place={pick.place}
              mapButtons
              badge={<span className="rounded-md bg-primary px-1.5 py-0.5 font-mono text-[11px] font-semibold text-on-primary">#{i + 1}</span>}
            >
              <div className="space-y-1.5 rounded-lg border border-accent-deep/60 bg-accent-bg/60 p-3 text-sm">
                <p className="leading-relaxed">{pick.reason}</p>
                {pick.tip && (
                  <p className="flex items-start gap-1.5 text-xs text-fg-2">
                    <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
                    {pick.tip}
                  </p>
                )}
              </div>
            </PlaceCard>
          ))}
        </section>
      )}
    </div>
  );
}
