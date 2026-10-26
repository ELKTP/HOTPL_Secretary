"use client";

import { useCallback, useState } from "react";
import { CircleCheck, Combine, LoaderCircle, Sparkles, TriangleAlert } from "lucide-react";
import { api } from "@/lib/client";
import type { DedupeResult, RefreshResult } from "@/lib/types";

export interface CleanupState {
  phase: "idle" | "dedupe" | "enrich" | "done" | "error";
  dedupe?: DedupeResult;
  enriched: number;
  failed: number;
  remaining: number | null;
  searchedAll: boolean;
  error?: string;
}

const INITIAL: CleanupState = { phase: "idle", enriched: 0, failed: 0, remaining: null, searchedAll: true };

/**
 * "정리하기": merge duplicates first, then enrich descriptions (and confirm event periods)
 * a few places per request until none are left.
 */
export function useCleanup(onFinished?: () => void) {
  const [state, setState] = useState<CleanupState>(INITIAL);

  const run = useCallback(async () => {
    let s: CleanupState = { ...INITIAL, phase: "dedupe" };
    setState(s);
    try {
      const dedupe = await api<DedupeResult>("/api/places/dedupe", {});
      s = { ...s, phase: "enrich", dedupe };
      setState(s);
      for (let round = 0; round < 500; round++) {
        const r = await api<RefreshResult>("/api/places/refresh", {});
        s = {
          ...s,
          enriched: s.enriched + r.checked,
          failed: s.failed + r.failed,
          remaining: r.remaining,
          searchedAll: s.searchedAll && r.searched,
        };
        setState(s);
        if (r.remaining === 0 || r.checked + r.failed === 0) break;
      }
      setState({ ...s, phase: "done" });
    } catch (e) {
      setState({ ...s, phase: "error", error: e instanceof Error ? e.message : "정리하지 못했어요." });
    }
    onFinished?.();
  }, [onFinished]);

  return { state, run, running: state.phase === "dedupe" || state.phase === "enrich" };
}

function Step({ status, icon: Icon, title, children }: { status: "wait" | "run" | "done"; icon: typeof Combine; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${
          status === "done" ? "border-success-line bg-success-bg text-success" : status === "run" ? "border-accent-deep bg-accent-bg text-accent" : "border-line bg-surface-2 text-fg-3"
        }`}
      >
        {status === "done" ? <CircleCheck className="h-4 w-4" /> : status === "run" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1 space-y-1 pt-1">
        <p className="text-sm font-medium">{title}</p>
        {children}
      </div>
    </div>
  );
}

export function CleanupPanel({ state }: { state: CleanupState }) {
  if (state.phase === "idle") return null;
  const { dedupe } = state;
  const enrichTotal = state.enriched + state.failed + (state.remaining ?? 0);

  return (
    <div className="card space-y-4">
      <Step status={state.phase === "dedupe" ? "run" : dedupe ? "done" : "wait"} icon={Combine} title="중복 장소 합치기">
        {dedupe &&
          (dedupe.groups.length ? (
            <div className="space-y-1.5 text-xs text-fg-2">
              <p>
                {dedupe.before}곳 → <b className="text-fg">{dedupe.after}곳</b> ({dedupe.groups.length}개 장소로 합침, 합쳐진 만큼 별이 늘었어요)
              </p>
              <div className="flex flex-wrap gap-1">
                {dedupe.groups.slice(0, 8).map((g) => (
                  <span key={g.name} className="chip border-line bg-surface-2 text-fg-2">
                    {g.name} ×{g.count}
                  </span>
                ))}
                {dedupe.groups.length > 8 && <span className="text-fg-3">외 {dedupe.groups.length - 8}곳</span>}
              </div>
            </div>
          ) : (
            <p className="text-xs text-fg-3">중복된 장소가 없어요.</p>
          ))}
      </Step>

      <Step
        status={state.phase === "enrich" ? "run" : state.phase === "done" ? "done" : "wait"}
        icon={Sparkles}
        title="설명 보강 · 행사 기간 확인"
      >
        {state.remaining !== null && (
          <>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className="brand-gradient-x h-full rounded-full transition-all"
                style={{ width: `${enrichTotal ? ((state.enriched + state.failed) / enrichTotal) * 100 : 100}%` }}
              />
            </div>
            <p className="font-mono text-[11px] text-fg-3">
              보강 {state.enriched}곳{state.failed ? ` · 실패 ${state.failed}곳` : ""} · 남은 {state.remaining}곳
            </p>
          </>
        )}
        {state.phase === "enrich" && state.remaining === null && <p className="text-xs text-fg-3">원본 게시물과 최근 후기를 살펴보는 중…</p>}
      </Step>

      {!state.searchedAll && (
        <p className="flex gap-2 rounded-lg border border-warn-line bg-warn-bg p-3 text-xs leading-relaxed text-warn">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          웹 검색을 쓸 수 없어 원본 게시물만으로 설명을 정리했어요. Anthropic 콘솔에서 웹 검색을 켜면 요즘 인기 이유와 행사 기간까지 확인해요.
        </p>
      )}
      {state.phase === "error" && <p className="text-sm text-danger">{state.error}</p>}
      {state.phase === "enrich" && (
        <p className="text-xs text-fg-3">장소가 많으면 몇 분 걸려요. 중간에 닫아도 다음에 [정리하기]를 누르면 이어서 해요.</p>
      )}
    </div>
  );
}
