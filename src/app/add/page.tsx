"use client";

import { useState } from "react";
import { ChevronDown, Smartphone } from "lucide-react";
import ItemList from "@/components/ItemList";
import QuickSave from "@/components/QuickSave";

export default function AddPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <p className="eyebrow">Add</p>
        <h1 className="text-2xl font-bold tracking-tight">취향 더하기</h1>
        <p className="text-sm text-fg-2">오늘 본 핫플을 바로 더해 두세요. 링크를 복사하거나 스크린샷을 올리면 AI가 장소를 정리해요.</p>
      </header>

      <QuickSave onSaved={() => setRefreshKey((k) => k + 1)} />

      <details className="group card p-0">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-accent-deep bg-accent-bg text-accent">
            <Smartphone className="h-4 w-4" />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-medium">공유 버튼 한 번으로 저장하기</span>
            <span className="block text-xs text-fg-3">안드로이드 · 선택 사항</span>
          </span>
          <ChevronDown className="h-4 w-4 text-fg-3 transition group-open:rotate-180" />
        </summary>
        <ol className="space-y-2 border-t border-line px-4 py-4 text-sm text-fg-2">
          {[
            <>크롬에서 이 사이트를 연 상태로 ⋮ 메뉴 → <b className="text-fg">홈 화면에 추가</b>(또는 앱 설치)</>,
            <>인스타·유튜브·카카오맵·네이버지도·구글지도에서 <b className="text-fg">공유 → 핫플비서</b></>,
            <>갤러리의 스크린샷도 같은 방법으로 공유할 수 있어요</>,
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="font-mono text-xs text-accent">0{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
          <li className="pt-1 text-xs text-fg-3">설치하지 않아도 위의 붙여넣기 버튼으로 똑같이 쓸 수 있어요.</li>
        </ol>
      </details>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold tracking-tight">최근 저장</h2>
          <span className="font-mono text-[11px] text-fg-3">최근 30건</span>
        </div>
        <ItemList refreshKey={refreshKey} />
      </section>
    </div>
  );
}
