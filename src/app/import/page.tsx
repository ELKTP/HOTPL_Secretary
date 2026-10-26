"use client";

import { useRef, useState } from "react";
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
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">처음 가져오기</h1>
        <p className="text-sm text-zinc-500">그동안 저장해 둔 핫플을 한 번에 모아요. 이후에는 홈에서 하나씩 저장하면 돼요.</p>
      </div>

      <details className="card text-sm" open>
        <summary className="cursor-pointer font-semibold">출처별 가져오는 방법</summary>
        <ul className="mt-2 space-y-2 text-zinc-600">
          <li>
            <b>카카오맵</b>: 즐겨찾기 → 폴더 목록 화면을 스크롤하며 <b>스크린샷</b> → ①에 여러 장 올리기
          </li>
          <li>
            <b>네이버지도</b>: 저장 → 리스트 화면 <b>스크린샷</b> → ①에 올리기
          </li>
          <li>
            <b>구글지도</b>: takeout.google.com → &lsquo;저장됨&rsquo;(또는 &lsquo;지도(내 장소)&rsquo;) 내보내기 → 받은 <b>CSV/JSON</b>을 ②에 올리기. 저장 목록 스크린샷도 가능
          </li>
          <li>
            <b>유튜브</b>: takeout.google.com → YouTube → 재생목록 → <b>좋아요 표시한 동영상 CSV</b>를 ②에 올리기 (장소 영상만 자동으로 골라 저장)
          </li>
          <li>
            <b>인스타그램</b>: 설정 → 계정 센터 → 내 정보 다운로드 → <b>JSON</b> 형식 → 저장한 게시물·좋아요 파일을 ②에 올리기. 본문을 못 가져온 게시물은 홈에서
            &lsquo;확인 필요&rsquo;로 표시돼요. 저장한 게시물 화면 스크린샷을 ①에 올려도 돼요.
          </li>
        </ul>
      </details>

      <section className="card space-y-2">
        <h2 className="font-semibold">① 스크린샷 여러 장</h2>
        <button className="btn-ghost w-full" onClick={() => imageRef.current?.click()} disabled={running}>
          🖼 이미지 선택
        </button>
        <input ref={imageRef} type="file" accept="image/*" multiple hidden onChange={(e) => onImages(e.target.files)} />
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">② 내보내기 파일 (CSV · JSON · TXT)</h2>
        <button className="btn-ghost w-full" onClick={() => fileRef.current?.click()} disabled={running}>
          📄 파일 선택
        </button>
        <input ref={fileRef} type="file" accept=".csv,.json,.txt,.html" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">③ 텍스트 붙여넣기</h2>
        <textarea
          className="input min-h-28"
          placeholder="메모장에 모아 둔 장소 목록, 블로그 글, 링크 여러 개 등"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
        />
        <button
          className="btn-ghost w-full"
          disabled={running || !pasted.trim()}
          onClick={() => setPlan({ kind: "text", chunks: chunkText(pasted) })}
        >
          이 내용으로 준비
        </button>
      </section>

      {plan && !running && (
        <div className="card space-y-2 ring-brand">
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
        <div className="card space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full bg-brand transition-all" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
          </div>
          <p className="text-sm">
            {progress.label} {progress.done}/{progress.total} 처리 · 장소 <b>{progress.places}</b>곳 저장
            {progress.needsInput > 0 && ` · 확인 필요 ${progress.needsInput}`}
            {progress.errors > 0 && ` · 오류 ${progress.errors}`}
          </p>
          {running ? (
            <p className="text-xs text-zinc-500">이 화면을 닫지 말고 기다려 주세요.</p>
          ) : (
            <p className="text-xs text-zinc-500">완료! &lsquo;내 장소&rsquo;에서 확인하세요. 확인이 필요한 항목은 홈 목록에 있어요.</p>
          )}
        </div>
      )}
    </div>
  );
}
