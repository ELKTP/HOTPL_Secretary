"use client";

import { useRef, useState } from "react";
import { api, toImageInput } from "@/lib/client";

/** Web-only saving: paste a copied link/caption or pick screenshots. */
export default function QuickSave({ onSaved }: { onSaved: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function save(body: { text?: string; images?: Awaited<ReturnType<typeof toImageInput>>[] }) {
    setBusy(true);
    setMessage("");
    try {
      const res = await api<{ duplicate?: boolean }>("/api/items", body);
      setMessage(res.duplicate ? "이미 저장한 링크예요." : "저장했어요! 분석이 끝나면 아래 목록에 표시돼요.");
      setText("");
      onSaved();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function pasteFromClipboard() {
    try {
      const clip = (await navigator.clipboard.readText()).trim();
      if (!clip) {
        setMessage("클립보드가 비어 있어요. 앱에서 '링크 복사'를 먼저 눌러 주세요.");
        return;
      }
      await save({ text: clip });
    } catch {
      setMessage("클립보드를 읽을 수 없어요. 아래 입력창을 길게 눌러 붙여넣어 주세요.");
      textareaRef.current?.focus();
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const images = await Promise.all(Array.from(files).slice(0, 5).map((f) => toImageInput(f)));
    await save({ text: text.trim() || undefined, images });
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-bold">핫플 저장하기</h2>
        <p className="text-xs text-zinc-500">
          인스타·유튜브·지도 앱에서 <b>링크 복사</b> 후 아래 버튼을 누르거나, 게시물 <b>스크린샷</b>을 올려 주세요.
        </p>
      </div>
      <button className="btn-primary w-full py-3 text-base" onClick={pasteFromClipboard} disabled={busy}>
        📋 복사한 링크 붙여넣어 저장
      </button>
      <textarea
        ref={textareaRef}
        className="input min-h-20"
        placeholder="또는 여기에 링크·캡션·장소 정보를 붙여넣기"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex gap-2">
        <button className="btn-ghost flex-1" onClick={() => save({ text })} disabled={busy || !text.trim()}>
          입력한 내용 저장
        </button>
        <button className="btn-ghost flex-1" onClick={() => fileRef.current?.click()} disabled={busy}>
          🖼 스크린샷 올리기
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      </div>
      {busy && <p className="text-sm text-zinc-500">저장 중…</p>}
      {message && !busy && <p className="text-sm text-brand-dark">{message}</p>}
    </section>
  );
}
