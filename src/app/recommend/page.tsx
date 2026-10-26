"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Lightbulb, LoaderCircle, Route, Sparkles } from "lucide-react";
import PlaceCard from "@/components/PlaceCard";
import { api } from "@/lib/client";
import type { RecommendInput, RecommendResult } from "@/lib/types";

const TIMES = ["오전", "점심", "오후", "저녁", "밤"];
const PURPOSES = ["데이트", "기념일", "소개팅", "친구 모임", "가족 나들이", "부모님과", "업무 미팅", "혼자"];
const COMPANIONS = ["연인", "친구", "가족", "부모님", "아이", "반려동물", "직장 동료"];

function todayLocal() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
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

function Field({ step, label, children }: { step: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="flex items-baseline gap-2 text-sm font-medium">
        <span className="font-mono text-[11px] text-accent">{step}</span>
        {label}
      </p>
      {children}
    </div>
  );
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export default function RecommendPage() {
  const [area, setArea] = useState("");
  const [date, setDate] = useState(todayLocal);
  const [times, setTimes] = useState<string[]>([]);
  const [timeNote, setTimeNote] = useState("");
  const [purposes, setPurposes] = useState<string[]>([]);
  const [purposeNote, setPurposeNote] = useState("");
  const [companions, setCompanions] = useState<string[]>([]);
  const [people, setPeople] = useState(2);
  const [extra, setExtra] = useState("");
  const [course, setCourse] = useState(false);
  const [includeVisited, setIncludeVisited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RecommendResult | null>(null);

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
      companions: [`총 ${people}명`, ...companions].join(", "),
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
        <h1 className="text-2xl font-bold tracking-tight">약속 장소 추천</h1>
        <p className="text-sm text-fg-2">저장해 둔 장소 중에서 이번 약속에 딱 맞는 곳을 골라 드려요.</p>
      </header>

      <form onSubmit={submit} className="card space-y-5 p-5">
        <Field step="01" label="어디서 만나요?">
          <input className="input" placeholder="예: 성수역, 강남, 연남동" value={area} onChange={(e) => setArea(e.target.value)} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field step="02" label="날짜">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field step="03" label="인원">
            <input className="input" type="number" min={1} max={30} value={people} onChange={(e) => setPeople(Number(e.target.value))} />
          </Field>
        </div>
        <Field step="04" label="시간">
          <Chips options={TIMES} selected={times} onToggle={(v) => setTimes(toggle(times, v))} />
          <input className="input" placeholder="직접 입력 (예: 오후 2시~6시)" value={timeNote} onChange={(e) => setTimeNote(e.target.value)} />
        </Field>
        <Field step="05" label="목적">
          <Chips options={PURPOSES} selected={purposes} onToggle={(v) => setPurposes(toggle(purposes, v))} />
          <input className="input" placeholder="직접 입력 (예: 오랜만에 만나는 대학 동기)" value={purposeNote} onChange={(e) => setPurposeNote(e.target.value)} />
        </Field>
        <Field step="06" label="누구와">
          <Chips options={COMPANIONS} selected={companions} onToggle={(v) => setCompanions(toggle(companions, v))} />
        </Field>
        <Field step="07" label="기타 조건">
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
          {busy ? "내 장소 중에서 고르는 중… (10~30초)" : "추천 받기"}
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>

      {result && (
        <section className="space-y-3">
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
