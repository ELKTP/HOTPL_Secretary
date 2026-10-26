"use client";

import type { ReactNode } from "react";
import { Calendar, Clock, ExternalLink, Heart, MapPin, NotebookPen, Trash2, Wallet } from "lucide-react";
import { mapLinks } from "@/lib/client";
import type { Place, PlaceStatus } from "@/lib/types";

const STATUS_LABEL: Record<PlaceStatus, string> = { want: "가고 싶음", visited: "다녀옴", skip: "제외" };

export default function PlaceCard({
  place,
  onStatus,
  onDelete,
  badge,
  mapButtons,
  children,
}: {
  place: Place;
  onStatus?: (status: PlaceStatus) => void;
  onDelete?: () => void;
  badge?: ReactNode;
  /** Show Kakao / Naver / Google map links as full-size buttons (recommendation results). */
  mapButtons?: boolean;
  children?: ReactNode;
}) {
  const period =
    place.kind !== "상설" && (place.start_date || place.end_date)
      ? `${place.start_date ?? ""} ~ ${place.end_date ?? ""}`
      : null;
  const details = [
    period && { icon: Calendar, text: period },
    place.hours && { icon: Clock, text: place.hours },
    place.price && { icon: Wallet, text: place.price },
    place.address && { icon: MapPin, text: place.address },
    place.memo && { icon: NotebookPen, text: `메모: ${place.memo}` },
  ].filter(Boolean) as { icon: typeof Calendar; text: string }[];

  return (
    <article className="card space-y-3 transition hover:border-line-strong">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {badge}
            <h3 className="text-[15px] font-semibold tracking-tight">{place.name}</h3>
            {place.save_count > 1 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-accent-deep bg-accent-bg px-1.5 py-0.5 font-mono text-[10px] text-accent-hi">
                <Heart className="h-2.5 w-2.5 fill-current" />×{place.save_count}
              </span>
            )}
          </div>
          <p className="font-mono text-[11px] text-fg-3">
            {[place.category, place.kind !== "상설" && place.kind !== place.category ? place.kind : null, place.area]
              .filter(Boolean)
              .join(" · ")}
          </p>
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

      {children}

      {place.summary && <p className="text-sm leading-relaxed text-fg-2">{place.summary}</p>}

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

      {(place.tags.length > 0 || place.good_for.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {place.good_for.map((t) => (
            <span key={`g-${t}`} className="chip border-accent-deep bg-accent-bg text-accent-hi">
              {t}
            </span>
          ))}
          {place.tags.map((t) => (
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
        {place.source_url && (
          <a href={place.source_url} target="_blank" rel="noreferrer" className="btn-mini">
            <ExternalLink className="h-3 w-3" />
            원본
          </a>
        )}
        {onDelete && (
          <button className="ml-auto p-1 text-fg-3 transition hover:text-danger" onClick={onDelete} aria-label="삭제">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </article>
  );
}
