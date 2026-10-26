"use client";

import { useState, type FormEvent } from "react";
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
          className={`chip ${selected.includes(o) ? "border-brand bg-brand text-white" : "border-zinc-200 bg-white text-zinc-600"}`}
        >
          {o}
        </button>
      ))}
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
    <div className="space-y-5">
      <h1 className="text-xl font-bold">약속 장소 추천</h1>
      <form onSubmit={submit} className="card space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-semibold">어디서 만나요?</span>
          <input className="input" placeholder="예: 성수역, 강남, 연남동" value={area} onChange={(e) => setArea(e.target.value)} required />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-sm font-semibold">날짜</span>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-semibold">인원</span>
            <input className="input" type="number" min={1} max={30} value={people} onChange={(e) => setPeople(Number(e.target.value))} />
          </label>
        </div>
        <div className="space-y-1.5">
          <span className="text-sm font-semibold">시간</span>
          <Chips options={TIMES} selected={times} onToggle={(v) => setTimes(toggle(times, v))} />
          <input className="input" placeholder="직접 입력 (예: 오후 2시~6시)" value={timeNote} onChange={(e) => setTimeNote(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <span className="text-sm font-semibold">목적</span>
          <Chips options={PURPOSES} selected={purposes} onToggle={(v) => setPurposes(toggle(purposes, v))} />
          <input className="input" placeholder="직접 입력 (예: 오랜만에 만나는 대학 동기)" value={purposeNote} onChange={(e) => setPurposeNote(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <span className="text-sm font-semibold">누구와</span>
          <Chips options={COMPANIONS} selected={companions} onToggle={(v) => setCompanions(toggle(companions, v))} />
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-semibold">기타 조건</span>
          <input className="input" placeholder="예: 조용한 곳, 1인 2만원 이하, 실내, 주차 필요" value={extra} onChange={(e) => setExtra(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={course} onChange={(e) => setCourse(e.target.checked)} /> 코스로 추천
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={includeVisited} onChange={(e) => setIncludeVisited(e.target.checked)} /> 다녀온 곳도 포함
          </label>
        </div>
        <button className="btn-primary w-full py-3 text-base" disabled={busy}>
          {busy ? "내 장소 중에서 고르는 중… (10~30초)" : "추천 받기"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      {result && (
        <section className="space-y-3">
          <div className="card bg-brand-soft ring-brand/20">
            <p className="text-sm font-semibold">{result.summary}</p>
            {result.course && <p className="mt-2 text-sm text-zinc-700">🗺 코스: {result.course}</p>}
          </div>
          {result.picks.map((pick, i) => (
            <PlaceCard key={pick.place.id} place={pick.place}>
              <div className="rounded-xl bg-zinc-50 p-3 text-sm">
                <p>
                  <b className="text-brand">추천 {i + 1}</b> {pick.reason}
                </p>
                {pick.tip && <p className="mt-1 text-xs text-zinc-500">💡 {pick.tip}</p>}
              </div>
            </PlaceCard>
          ))}
        </section>
      )}
    </div>
  );
}
