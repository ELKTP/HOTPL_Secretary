"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  Camera,
  ChevronDown,
  ChevronRight,
  CirclePlay,
  CircleCheck,
  ExternalLink,
  FileText,
  Images,
  Lightbulb,
  LoaderCircle,
  Map as MapIcon,
  Type,
  type LucideIcon,
} from "lucide-react";
import { api, runPool, toImageInput } from "@/lib/client";
import { chunkText, emptyPlan, planFromFile, type Plan } from "@/lib/importers";

interface Progress {
  total: number;
  done: number;
  places: number;
  needsInput: number;
  errors: number;
}

// ---------- 출처별 가이드 ----------

function MenuPath({ items }: { items: string[] }) {
  return (
    <span className="my-1 flex flex-wrap items-center gap-1">
      {items.map((item, i) => (
        <span key={item} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 text-fg-3" />}
          <span className="rounded-md border border-line-strong bg-surface-3 px-1.5 py-0.5 text-xs font-medium text-fg">{item}</span>
        </span>
      ))}
    </span>
  );
}

const B = ({ children }: { children: ReactNode }) => <b className="font-semibold text-fg">{children}</b>;

interface Guide {
  source: string;
  icon: LucideIcon;
  method: string;
  time: string;
  steps: ReactNode[];
  tips: ReactNode[];
  link?: { href: string; label: string };
}

const SCROLL_CAPTURE_TIP = (
  <>
    목록이 길면 갤럭시는 캡처 직후 아래에 뜨는 <B>스크롤 캡처</B> 버튼(아래 화살표)을, 픽셀은 <B>더 캡처하기</B>를 누르면 한 장에 길게 담겨요.
  </>
);

const GUIDES: Guide[] = [
  {
    source: "카카오맵",
    icon: MapIcon,
    method: "스크린샷 → ①",
    time: "약 3분",
    steps: [
      <>카카오맵 앱에서 즐겨찾기 화면으로 들어가요.<MenuPath items={["마이페이지", "즐겨찾기 탭"]} /></>,
      <>가져올 <B>그룹(폴더)</B>을 눌러 장소 목록을 열어요.</>,
      <>장소 이름과 주소가 보이는 상태로 목록을 <B>스크린샷</B>해요. 아래로 넘기며 여러 장 찍어도 돼요.</>,
      <>이 화면의 <B>① 스크린샷</B>에서 찍은 이미지를 한꺼번에 골라 올려요.</>,
    ],
    tips: [
      SCROLL_CAPTURE_TIP,
      <>카카오맵에는 즐겨찾기를 파일로 내보내는 기능이 없어서 스크린샷이 가장 확실해요. 그룹이 여러 개면 그룹마다 반복해요.</>,
    ],
    link: { href: "https://cs.kakao.com/helps_html/1073190962?locale=ko", label: "카카오맵 즐겨찾기 도움말" },
  },
  {
    source: "네이버지도",
    icon: MapIcon,
    method: "스크린샷 → ①",
    time: "약 3분",
    steps: [
      <>네이버지도 앱 아래쪽의 <B>저장</B> 탭을 눌러요.<MenuPath items={["저장", "리스트 선택"]} /></>,
      <>가져올 <B>리스트</B>를 눌러 장소 목록을 열어요.</>,
      <>장소 이름과 주소(또는 지역)가 보이게 목록을 <B>스크린샷</B>해요.</>,
      <>이 화면의 <B>① 스크린샷</B>에서 이미지를 한꺼번에 올려요.</>,
    ],
    tips: [SCROLL_CAPTURE_TIP, <>네이버지도도 저장 목록을 파일로 내보내는 기능이 없어요. 앱 버전에 따라 메뉴 위치가 조금 다를 수 있어요.</>],
  },
  {
    source: "구글지도",
    icon: MapIcon,
    method: "ZIP 파일 → ②",
    time: "5분 + 메일 대기",
    steps: [
      <>브라우저에서 <B>takeout.google.com</B>에 접속해 구글 계정으로 로그인해요. (아래 버튼)</>,
      <>목록 위쪽의 <B>모두 선택 해제</B>를 눌러요.</>,
      <>
        아래로 내려 <B>저장됨</B>에 체크해요. 직접 만든 저장 목록(가고 싶은 장소, 즐겨찾는 장소 등)이 목록별로 담겨요. 별표 표시한 장소도 원하면 <B>지도(내 장소)</B>도 체크해요.
      </>,
      <>맨 아래 <B>다음 단계</B>를 누르고, 설정은 그대로(이메일로 링크 받기 · 1회 내보내기 · .zip) 둔 채 <B>내보내기 생성</B>을 눌러요.</>,
      <>메일이 오면 <B>파일 다운로드</B>를 눌러 ZIP을 받고, <B>압축을 풀지 말고</B> 이 화면의 <B>② 파일</B>에 그대로 올려요.</>,
    ],
    tips: [<>보통 몇 분이면 메일이 오지만 저장이 많으면 몇 시간 걸릴 수 있어요. 메일 제목은 &lsquo;Google 데이터를 다운로드할 수 있습니다&rsquo;예요.</>],
    link: { href: "https://takeout.google.com/", label: "구글 테이크아웃 열기" },
  },
  {
    source: "유튜브",
    icon: CirclePlay,
    method: "ZIP 파일 → ②",
    time: "5분 + 메일 대기",
    steps: [
      <>브라우저에서 <B>takeout.google.com</B>에 로그인해요. (아래 버튼)</>,
      <><B>모두 선택 해제</B>를 누른 뒤, 아래로 내려 <B>YouTube 및 YouTube Music</B>에만 체크해요.</>,
      <>
        그 항목 아래의 <B>모든 YouTube 데이터 포함됨</B> 버튼을 눌러, 열린 창에서 <B>모두 선택 해제</B> → <B>재생목록</B>만 체크 → <B>확인</B>. 좋아요 표시한 동영상 목록이 재생목록 파일에 함께 들어 있어요.
      </>,
      <><B>다음 단계</B> → <B>내보내기 생성</B>을 누르고, 메일로 받은 ZIP을 <B>압축을 풀지 말고</B> <B>② 파일</B>에 올려요.</>,
    ],
    tips: [
      <>앱이 &lsquo;좋아요 표시한 동영상&rsquo; 목록을 찾아 장소 관련 영상만 골라 저장해요. 그 목록이 없으면 다른 재생목록의 영상을 대신 살펴봐요.</>,
      <>영상 제목·설명에 장소 정보가 없으면 저장되지 않을 수 있어요. 그런 영상은 유튜브 앱에서 공유하기로 하나씩 더해 주세요.</>,
    ],
    link: { href: "https://takeout.google.com/", label: "구글 테이크아웃 열기" },
  },
  {
    source: "인스타그램",
    icon: Camera,
    method: "ZIP 파일 → ②",
    time: "5분 + 알림 대기",
    steps: [
      <>인스타그램 앱에서 계정 센터로 들어가요.<MenuPath items={["내 프로필", "☰ 메뉴", "계정 센터"]} /></>,
      <>내보내기 화면을 열어요.<MenuPath items={["내 정보 및 권한", "내 정보 내보내기", "내보내기 만들기"]} /></>,
      <>인스타그램 계정을 고르고 <B>기기로 내보내기</B>를 선택해요.</>,
      <>내보낼 정보를 고르는 화면에서 <B>저장됨</B>·<B>좋아요</B> 관련 항목만 남겨요. 전부 내보내도 되지만 파일이 커져요.</>,
      <><B>기간: 전체 기간</B>, <B>형식: JSON</B>, <B>미디어 화질: 낮음</B>으로 바꾸고 <B>내보내기 시작</B>을 눌러요.</>,
      <>준비 완료 알림이 오면 같은 화면에서 <B>다운로드</B>해, ZIP을 <B>압축을 풀지 말고</B> <B>② 파일</B>에 올려요.</>,
    ],
    tips: [
      <>보통 몇 분~몇 시간 걸리고, 다운로드 링크는 4일 동안만 유효해요. 메뉴 이름은 앱 버전에 따라 조금 다를 수 있어요.</>,
      <>
        내보낸 파일에는 게시물 링크만 있어서 앱이 각 게시물 본문을 다시 읽어 장소를 찾아요. 본문을 못 읽은 게시물은 <B>취향 더하기</B> 목록에 &lsquo;확인 필요&rsquo;로 표시되니 캡션이나 스크린샷을 보충해 주세요.
      </>,
    ],
  },
];

function GuideItem({ guide }: { guide: Guide }) {
  const Icon = guide.icon;
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-fg-2">
          <Icon className="h-4 w-4" />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-medium">{guide.source}</span>
          <span className="block font-mono text-[11px] text-fg-3">
            {guide.method} · {guide.time}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 text-fg-3 transition group-open:rotate-180" />
      </summary>
      <div className="space-y-3 px-4 pb-4">
        <ol className="space-y-3">
          {guide.steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed text-fg-2">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-bg font-mono text-[11px] text-accent ring-1 ring-accent-deep">
                {i + 1}
              </span>
              <span className="min-w-0">{step}</span>
            </li>
          ))}
        </ol>
        <div className="space-y-1.5 rounded-lg border border-line bg-canvas p-3">
          {guide.tips.map((tip, i) => (
            <p key={i} className="flex gap-2 text-xs leading-relaxed text-fg-2">
              <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
              <span>{tip}</span>
            </p>
          ))}
        </div>
        {guide.link && (
          <a href={guide.link.href} target="_blank" rel="noreferrer" className="btn-secondary w-full py-2 text-xs">
            <ExternalLink className="h-3.5 w-3.5" />
            {guide.link.label}
          </a>
        )}
      </div>
    </details>
  );
}

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
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [pasted, setPasted] = useState("");
  const imageRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setProgress(null);
    setPlan(null);
    setFileError("");
    setReading(true);
    try {
      setPlan(await planFromFile(file));
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "파일을 읽지 못했어요.");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onImages(files: FileList | null) {
    if (!files?.length) return;
    setProgress(null);
    setPlan({ ...emptyPlan(), files: Array.from(files), found: [`스크린샷 ${files.length}장`] });
  }

  async function start(p: Plan) {
    setRunning(true);
    const stats: Progress = { total: p.urls.length + p.chunks.length + p.files.length, done: 0, places: 0, needsInput: 0, errors: 0 };
    setProgress({ ...stats });

    const send = async (body: object) => {
      try {
        const res = await api<{ status?: string; count?: number }>("/api/items", { ...body, wait: true });
        stats.places += res.count ?? 0;
        if (res.status === "needs_input") stats.needsInput++;
        if (res.status === "error") stats.errors++;
      } catch {
        stats.errors++;
      }
    };
    const onProgress = () => setProgress({ ...stats, done: ++stats.done });

    await runPool(p.chunks, 2, (text) => send({ text }), onProgress);
    await runPool(p.files, 2, async (f) => send({ images: [await toImageInput(f)] }), onProgress);
    await runPool(p.urls, 3, (url) => send({ url }), onProgress);

    setRunning(false);
    setPlan(null);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <p className="eyebrow">Import</p>
        <h1 className="text-2xl font-bold tracking-tight">처음 가져오기</h1>
        <p className="text-sm text-fg-2">
          앱마다 저장해 둔 핫플을 한 번에 모아요. 내가 쓰는 앱의 안내만 열어서 따라 하세요. 이후에는 &lsquo;취향 더하기&rsquo;에서 하나씩 더하면 돼요.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-semibold">출처별 가져오는 방법</h2>
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {GUIDES.map((g) => (
            <GuideItem key={g.source} guide={g} />
          ))}
        </div>
      </section>

      <Option step="①" icon={Images} title="스크린샷 여러 장" desc="카카오맵·네이버지도 저장 목록 화면 등">
        <button className="btn-secondary w-full" onClick={() => imageRef.current?.click()} disabled={running}>
          이미지 선택
        </button>
        <input ref={imageRef} type="file" accept="image/*" multiple hidden onChange={(e) => onImages(e.target.files)} />
      </Option>

      <Option step="②" icon={FileText} title="내보내기 파일" desc="구글 테이크아웃·인스타그램 ZIP 그대로, 또는 CSV · JSON · TXT">
        <button className="btn-secondary w-full" onClick={() => fileRef.current?.click()} disabled={running || reading}>
          {reading && <LoaderCircle className="h-4 w-4 animate-spin" />}
          {reading ? "파일 살펴보는 중…" : "파일 선택"}
        </button>
        <input ref={fileRef} type="file" accept=".zip,.csv,.json,.txt,.html" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        {fileError && <p className="text-sm text-danger">{fileError}</p>}
      </Option>

      <Option step="③" icon={Type} title="텍스트 붙여넣기" desc="메모장에 모아 둔 장소 목록, 블로그 글 등">
        <textarea className="input min-h-28 resize-none" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="여기에 붙여넣기" />
        <button
          className="btn-secondary w-full"
          disabled={running || !pasted.trim()}
          onClick={() => {
            const chunks = chunkText(pasted);
            setPlan({ ...emptyPlan(), chunks, found: [`텍스트 ${chunks.length}묶음`] });
          }}
        >
          이 내용으로 준비
        </button>
      </Option>

      {plan && !running && (
        <div className="card glow-lg sticky bottom-4 space-y-3 border-accent-deep">
          <p className="text-sm font-medium">이렇게 가져올게요</p>
          <ul className="space-y-1 text-sm text-fg-2">
            {plan.found.map((f) => (
              <li key={f} className="flex gap-2">
                <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                {f}
              </li>
            ))}
          </ul>
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
              {progress.done}/{progress.total}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className="brand-gradient-x h-full rounded-full transition-all" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
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
            {running
              ? "이 화면을 닫지 말고 기다려 주세요. 링크가 많으면 몇 분 걸려요."
              : "‘내 장소’에서 확인하세요. 확인이 필요한 항목은 ‘취향 더하기’ 목록에 있어요."}
          </p>
        </div>
      )}
    </div>
  );
}
