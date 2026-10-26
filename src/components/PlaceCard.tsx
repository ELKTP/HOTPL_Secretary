"use client";

import { useState, type ReactNode } from "react";
import { CalendarRange, CircleCheck, Clock, ExternalLink, MapPin, NotebookPen, RefreshCw, Star, Trash2, Wallet } from "lucide-react";
import { mapLinks } from "@/lib/client";
import { isTemporary, type Place, type PlaceStatus } from "@/lib/types";

const STATUS_LABEL: Record<PlaceStatus, string> = { want: "가고 싶음", visited: "다녀옴", skip: "제외" };
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function todayLocal() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** "2026-10-20" -> "10.20(화)" */
function shortDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return `${d.getMonth() + 1}.${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

/** Where an event stands today: upcoming, running (with days left), or over. */
export function eventTiming(place: Pick<Place, "start_date" | "end_date">) {
  const today = todayLocal();
  if (place.end_date && place.end_date < today) return { label: "종료", tone: "border-danger-line bg-danger-bg text-danger", ended: true };
  if (place.start_date && place.start_date > today)
    return { label: `오픈 D-${daysBetween(today, place.start_date)}`, tone: "border-info-line bg-info-bg text-info", ended: false };
  if (place.end_date) {
    const left = daysBetween(today, place.end_date);
    return {
      label: left === 0 ? "오늘 마감" : `마감 D-${left}`,
      tone: left <= 7 ? "border-warn-line bg-warn-bg text-warn" : "border-line bg-surface-2 text-fg-2",
      ended: false,
    };
  }
  return { label: "진행 중", tone: "border-line bg-surface-2 text-fg-2", ended: false };
}

/** One star per save (up to five); shown once a place has been saved more than once. */
function Stars({ count }: { count: number }) {
  if (count < 2) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-warn" title={`${count}번 저장`}>
      {Array.from({ length: Math.min(count, 5) }, (_, i) => (
        <Star key={i} className="h-3.5 w-3.5 fill-current" />
      ))}
      <span className="ml-1 font-mono text-[11px]">{count}번 저장</span>
    </span>
  );
}

function EventPeriod({ place }: { place: Place }) {
  const timing = eventTiming(place);
  const range =
    place.start_date || place.end_date
      ? `${place.start_date ? shortDate(place.start_date) : "시작일 미정"} – ${place.end_date ? shortDate(place.end_date) : "종료일 미정"}`
      : "기간 정보 없음";
  const verified = place.period_status === "verified";
  return (
    <div className="space-y-1.5 rounded-lg border border-line bg-canvas px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <CalendarRange className="h-4 w-4 text-accent" />
        <span className="font-semibold text-fg">{range}</span>
        <span className={`rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${timing.tone}`}>{timing.label}</span>
        {verified ? (
          <a
            href={place.period_source ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-success-line bg-success-bg px-1.5 py-0.5 text-[11px] text-success"
          >
            <CircleCheck className="h-3 w-3" />
            기간 확인됨
          </a>
        ) : (
          <span className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg-3">
            {place.period_status === "not_found" ? "기간 확인 못 함" : "기간 미확인"}
          </span>
        )}
      </div>
      {place.period_note && <p className="pl-5.5 text-xs text-fg-2">{place.period_note}</p>}
    </div>
  );
}

export default function PlaceCard({
  place,
  onStatus,
  onDelete,
  onRefresh,
  badge,
  mapButtons,
  children,
}: {
  place: Place;
  onStatus?: (status: PlaceStatus) => void;
  onDelete?: () => void;
  /** Re-research the place (description, event period). */
  onRefresh?: () => Promise<void>;
  badge?: ReactNode;
  /** Show Kakao / Naver / Google map links as full-size buttons (recommendation results). */
  mapButtons?: boolean;
  children?: ReactNode;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const event = isTemporary(place.kind);
  const ended = event && eventTiming(place).ended;
  const sources = [...new Set([...(place.sources ?? []), place.source_url].filter((u): u is string => !!u))];
  const details = [
    place.hours && { icon: Clock, text: place.hours },
    place.price && { icon: Wallet, text: place.price },
    place.address && { icon: MapPin, text: place.address },
    place.memo && { icon: NotebookPen, text: `메모: ${place.memo}` },
  ].filter(Boolean) as { icon: typeof Clock; text: string }[];

  async function refresh() {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <article className={`card space-y-3 transition hover:border-line-strong ${ended ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {badge}
            <h3 className="text-[15px] font-semibold tracking-tight">{place.name}</h3>
          </div>
          <p className="font-mono text-[11px] text-fg-3">
            {[place.category, event && place.kind !== place.category ? place.kind : null, place.area].filter(Boolean).join(" · ")}
          </p>
          <Stars count={place.save_count} />
        </div>
        {onStatus && (
          <select
            className="rounded-md border border-line bg-surface-2 px-2 py-1 text-xs text-fg-2 outline-none focus:border-accent"
            value={place.status}
            onChange={(e) => onStatus(e.target.value as PlaceStatus)}
          >
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        )}
      </div>

      {event && <EventPeriod place={place} />}

      {children}

      {place.summary && <p className="text-sm leading-relaxed whitespace-pre-line text-fg-2">{place.summary}</p>}

      {details.length > 0 && (
        <dl className="space-y-1 text-xs text-fg-3">
          {details.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-start gap-2">
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{text}</span>
            </div>
          ))}
        </dl>
      )}

      {((place.tags ?? []).length > 0 || (place.good_for ?? []).length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {(place.good_for ?? []).map((t) => (
            <span key={`g-${t}`} className="chip border-accent-deep bg-accent-bg text-accent-hi">
              {t}
            </span>
          ))}
          {(place.tags ?? []).map((t) => (
            <span key={`t-${t}`} className="chip border-line bg-surface-2 text-fg-2">
              #{t}
            </span>
          ))}
        </div>
      )}

      {mapButtons && (
        <div className="grid grid-cols-3 gap-2 border-t border-line pt-3">
          {mapLinks(place).map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="btn-secondary px-2 py-2 text-xs">
              <MapPin className="h-3.5 w-3.5 text-accent" />
              {l.label}
            </a>
          ))}
        </div>
      )}

      <div className={`flex flex-wrap items-center gap-1.5 ${mapButtons ? "" : "border-t border-line pt-3"}`}>
        {!mapButtons &&
          mapLinks(place).map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="btn-mini">
              <MapPin className="h-3 w-3" />
              {l.label}
            </a>
          ))}
        {sources.slice(0, 3).map((url, i) => (
          <a key={url} href={url} target="_blank" rel="noreferrer" className="btn-mini">
            <ExternalLink className="h-3 w-3" />
            {sources.length > 1 ? `원본 ${i + 1}` : "원본"}
          </a>
        ))}
        {sources.length > 3 && <span className="text-[11px] text-fg-3">+{sources.length - 3}</span>}
        <span className="ml-auto flex items-center gap-1">
          {onRefresh && (
            <button className="p-1 text-fg-3 transition hover:text-accent" onClick={refresh} disabled={refreshing} aria-label="정보 새로고침" title="정보 새로고침">
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-accent" : ""}`} />
            </button>
          )}
          {onDelete && (
            <button className="p-1 text-fg-3 transition hover:text-danger" onClick={onDelete} aria-label="삭제">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </span>
      </div>
    </article>
  );
}
