"use client";

import { useState } from "react";
import ItemList from "@/components/ItemList";
import QuickSave from "@/components/QuickSave";

export default function Home() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-5">
      <QuickSave onSaved={() => setRefreshKey((k) => k + 1)} />

      <details className="card text-sm">
        <summary className="cursor-pointer font-semibold">📲 공유 버튼 한 번으로 저장하기 (안드로이드)</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-zinc-600">
          <li>크롬에서 이 사이트를 연 상태로 오른쪽 위 ⋮ 메뉴 → <b>홈 화면에 추가</b>(또는 앱 설치)를 누르세요.</li>
          <li>인스타·유튜브·카카오맵·네이버지도·구글지도에서 <b>공유</b> → <b>핫플비서</b>를 고르면 바로 저장돼요.</li>
          <li>갤러리의 스크린샷도 같은 방법으로 공유할 수 있어요.</li>
        </ol>
        <p className="mt-2 text-xs text-zinc-400">설치하지 않아도 위의 붙여넣기 버튼으로 똑같이 쓸 수 있어요.</p>
      </details>

      <section className="space-y-2">
        <h2 className="font-bold">최근 저장</h2>
        <ItemList refreshKey={refreshKey} />
      </section>
    </div>
  );
}
