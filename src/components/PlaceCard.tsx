"use client";

import type { ReactNode } from "react";
import { mapLinks } from "@/lib/client";
import type { Place, PlaceStatus } from "@/lib/types";

const STATUS_LABEL: Record<PlaceStatus, string> = { want: "가고 싶음", visited: "다녀옴", skip: "제외" };

export default function PlaceCard({
  place,
  onStatus,
  onDelete,
  children,
}: {
  place: Place;
  onStatus?: (status: PlaceStatus) => void;
  onDelete?: () => void;
  children?: ReactNode;
}) {
  const period =
    place.kind !== "상설" && (place.start_date || place.end_date)
      ? `${place.start_date ?? ""} ~ ${place.end_date ?? ""}`
      : null;

  return (
    <article className="card space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold">
            {place.name}
            {place.save_count > 1 && (
              <span className="ml-1.5 align-middle text-xs font-semibold text-brand">♥ {place.save_count}번 저장</span>
            )}
          </h3>
          <p className="text-xs text-zinc-500">
            {[place.category, place.kind !== "상설" ? place.kind : null, place.area].filter(Boolean).join(" · ")}
          </p>
        </div>
        {onStatus && (
          <select
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs"
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

      {place.summary && <p className="text-sm text-zinc-700">{place.summary}</p>}
      <dl className="space-y-0.5 text-xs text-zinc-500">
        {period && <div>📅 기간 {period}</div>}
        {place.hours && <div>🕒 {place.hours}</div>}
        {place.price && <div>💳 {place.price}</div>}
        {place.address && <div>📍 {place.address}</div>}
      </dl>
      {(place.tags.length > 0 || place.good_for.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {place.good_for.map((t) => (
            <span key={`g-${t}`} className="chip border-brand/30 bg-brand-soft text-brand-dark">
              {t}
            </span>
          ))}
          {place.tags.map((t) => (
            <span key={`t-${t}`} className="chip border-zinc-200 text-zinc-600">
              #{t}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs font-semibold">
        {mapLinks(place).map((l) => (
          <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="text-sky-700">
            {l.label}
          </a>
        ))}
        {place.source_url && (
          <a href={place.source_url} target="_blank" rel="noreferrer" className="text-zinc-500">
            원본 게시물
          </a>
        )}
        {onDelete && (
          <button className="ml-auto font-normal text-zinc-400" onClick={onDelete}>
            삭제
          </button>
        )}
      </div>
    </article>
  );
}
