"use client";

import { useRef, useState, type ReactNode } from "react";
import { ChevronDown, CircleCheck, FileText, Images, LoaderCircle, Type, type LucideIcon } from "lucide-react";
import { api, runPool, toImageInput } from "@/lib/client";

const MAX_LINKS = 300;
const CHUNK_SIZE = 6000;

type Plan = { kind: "links"; urls: string[] } | { kind: "text"; chunks: string[] } | { kind: "images"; files: File[] };

interface Progress {
  label: string;
  total: number;
  done: number;
  places: number;
  needsInput: number;
  errors: number;
}

function chunkText(text: string) {
  const chunks: string[] = [];
  let current = "";
  for (const line of text.split(/\r?\n/)) {
    if (current.length + line.length > CHUNK_SIZE && current) {
      chunks.push(current);
      current = "";
    }
    current += line.slice(0, CHUNK_SIZE) + "\n";
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

function collectUrls(value: unknown, out: Set<string>) {
  if (typeof value === "string") {
    if (/^https?:\/\//.test(value) && !/(cdninstagram|fbcdn|scontent)/.test(value)) out.add(value);
  } else if (Array.isArray(value)) value.forEach((v) => collectUrls(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectUrls(v, out));
}

/** Decides how to import a file: links to visit one by one, or text to read in chunks. */
function planFromFile(name: string, content: string): Plan {
  if (/\.json$/i.test(name)) {
    try {
      const json = JSON.parse(content);
      if (Array.isArray(json?.features)) {
        // Google Takeout "Saved Places.json": names and addresses are already inside.
        const lines = json.features.map((f: { properties?: unknown }) => JSON.stringify(f.properties));
        return { kind: "text", chunks: chunkText(lines.join("\n")) };
      }
      const urls = new Set<string>();
      collectUrls(json, urls);
      if (urls.size) return { kind: "links", urls: [...urls].slice(0, MAX_LINKS) };
    } catch {}
  }
  const [header, ...rows] = content.split(/\r?\n/);
  if (/video id|동영상 id/i.test(header ?? "")) {
    const ids = rows.map((r) => r.split(",")[0]?.trim()).filter((id) => /^[\w-]{11}$/.test(id));
    return { kind: "links", urls: ids.slice(0, MAX_LINKS).map((id) => `https://www.youtube.com/watch?v=${id}`) };
  }
  return { kind: "text", chunks: chunkText(content) };
}

const GUIDES: { source: string; how: ReactNode }[] = [
  { source: "카카오맵", how: <>즐겨찾기 → 폴더 목록 화면을 스크롤하며 <b className="text-fg">스크린샷</b> → ①에 여러 장 올리기</> },
  { source: "네이버지도", how: <>저장 → 리스트 화면 <b className="text-fg">스크린샷</b> → ①에 올리기</> },
  {
    source: "구글지도",
    how: <>takeout.google.com → &lsquo;저장됨&rsquo; 또는 &lsquo;지도(내 장소)&rsquo; 내보내기 → <b className="text-fg">CSV/JSON</b>을 ②에 올리기</>,
  },
  {
    source: "유튜브",
    how: <>takeout.google.com → YouTube → 재생목록 → <b className="text-fg">좋아요 표시한 동영상 CSV</b>를 ②에 올리기 (장소 영상만 자동 선별)</>,
  },
  {
    source: "인스타그램",
    how: (
      <>
        계정 센터 → 내 정보 다운로드 → <b className="text-fg">JSON</b> 형식 → 저장·좋아요 파일을 ②에 올리기. 본문을 못 가져온 게시물은 홈에서 &lsquo;확인 필요&rsquo;로 표시돼요.
        저장한 게시물 화면 스크린샷을 ①에 올려도 돼요.
      </>
    ),
  },
];

function Option({ step, icon: Icon, title, desc, children }: { step: string; icon: LucideIcon; title: string; desc: string; children: ReactNode }) {
  return (
    <section className="card space-y-3">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-accent-deep bg-accent-bg text-accent">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-medium">
            <span className="mr-1.5 font-mono text-[11px] text-accent">{step}</span>
            {title}
          </p>
          <p className="text-xs text-fg-3">{desc}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function ImportPage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const [pasted, setPasted] = useState("");
  const imageRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setProgress(null);
    setPlan(planFromFile(file.name, await file.text()));
  }

  function onImages(files: FileList | null) {
    if (!files?.length) return;
    setProgress(null);
    setPlan({ kind: "images", files: Array.from(files) });
  }

  async function start(p: Plan) {
    setRunning(true);
    const stats: Progress = {
      label: p.kind === "links" ? "링크" : p.kind === "images" ? "스크린샷" : "텍스트 묶음",
      total: p.kind === "links" ? p.urls.length : p.kind === "images" ? p.files.length : p.chunks.length,
      done: 0,
      places: 0,
      needsInput: 0,
      errors: 0,
    };
    setProgress({ ...stats });

    const record = (res: { status?: string; count?: number }) => {
      stats.places += res.count ?? 0;
      if (res.status === "needs_input") stats.needsInput++;
      if (res.status === "error") stats.errors++;
    };
    const send = async (body: object) => {
      try {
        record(await api<{ status?: string; count?: number }>("/api/items", { ...body, wait: true }));
      } catch {
        stats.errors++;
      }
    };
    const onProgress = (done: number) => setProgress({ ...stats, done });

    if (p.kind === "links") await runPool(p.urls, 3, (url) => send({ url }), onProgress);
    if (p.kind === "text") await runPool(p.chunks, 2, (text) => send({ text }), onProgress);
    if (p.kind === "images")
      await runPool(p.files, 2, async (f) => send({ images: [await toImageInput(f)] }), onProgress);

    setRunning(false);
    setPlan(null);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <p className="eyebrow">Import</p>
        <h1 className="text-2xl font-bold tracking-tight">처음 가져오기</h1>
        <p className="text-sm text-fg-2">그동안 저장해 둔 핫플을 한 번에 모아요. 이후에는 홈에서 하나씩 저장하면 돼요.</p>
      </header>

      <details className="group card p-0" open>
        <summary className="flex cursor-pointer list-none items-center justify-between p-4 text-sm font-medium">
          출처별 가져오는 방법
          <ChevronDown className="h-4 w-4 text-fg-3 transition group-open:rotate-180" />
        </summary>
        <ul className="divide-y divide-line border-t border-line">
          {GUIDES.map((g) => (
            <li key={g.source} className="grid grid-cols-[72px_1fr] gap-3 px-4 py-3 text-sm">
              <span className="font-mono text-[11px] leading-5 text-accent">{g.source}</span>
              <span className="leading-relaxed text-fg-2">{g.how}</span>
            </li>
          ))}
        </ul>
      </details>

      <Option step="①" icon={Images} title="스크린샷 여러 장" desc="지도 앱 저장 목록, 저장한 게시물 화면">
        <button className="btn-secondary w-full" onClick={() => imageRef.current?.click()} disabled={running}>
          이미지 선택
        </button>
        <input ref={imageRef} type="file" accept="image/*" multiple hidden onChange={(e) => onImages(e.target.files)} />
      </Option>

      <Option step="②" icon={FileText} title="내보내기 파일" desc="CSV · JSON · TXT (구글 테이크아웃, 인스타 내 정보 다운로드)">
        <button className="btn-secondary w-full" onClick={() => fileRef.current?.click()} disabled={running}>
          파일 선택
        </button>
        <input ref={fileRef} type="file" accept=".csv,.json,.txt,.html" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </Option>

      <Option step="③" icon={Type} title="텍스트 붙여넣기" desc="메모장에 모아 둔 장소 목록, 블로그 글, 링크 여러 개">
        <textarea className="input min-h-28 resize-none" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="여기에 붙여넣기" />
        <button
          className="btn-secondary w-full"
          disabled={running || !pasted.trim()}
          onClick={() => setPlan({ kind: "text", chunks: chunkText(pasted) })}
        >
          이 내용으로 준비
        </button>
      </Option>

      {plan && !running && (
        <div className="card glow-lg sticky bottom-4 space-y-3 border-accent-deep">
          <p className="text-sm">
            {plan.kind === "links" && `링크 ${plan.urls.length}개를 찾았어요. 하나씩 열어 장소를 찾아요.`}
            {plan.kind === "text" && `텍스트 ${plan.chunks.length}묶음을 분석해요.`}
            {plan.kind === "images" && `스크린샷 ${plan.files.length}장을 분석해요.`}
          </p>
          <button className="btn-primary w-full" onClick={() => start(plan)}>
            가져오기 시작
          </button>
        </div>
      )}

      {progress && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-medium">
              {running ? <LoaderCircle className="h-4 w-4 animate-spin text-accent" /> : <CircleCheck className="h-4 w-4 text-success" />}
              {running ? "가져오는 중" : "완료"}
            </span>
            <span className="font-mono text-[11px] text-fg-3">
              {progress.label} {progress.done}/{progress.total}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div
              className="brand-gradient-x h-full rounded-full transition-all"
              style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: "저장된 장소", value: progress.places, tone: "text-success" },
              { label: "확인 필요", value: progress.needsInput, tone: "text-info" },
              { label: "오류", value: progress.errors, tone: "text-danger" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-line bg-surface-2 py-2">
                <p className={`font-mono text-lg font-semibold ${s.tone}`}>{s.value}</p>
                <p className="text-[11px] text-fg-3">{s.label}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-fg-3">
            {running ? "이 화면을 닫지 말고 기다려 주세요." : "‘내 장소’에서 확인하세요. 확인이 필요한 항목은 홈 목록에 있어요."}
          </p>
        </div>
      )}
    </div>
  );
}
