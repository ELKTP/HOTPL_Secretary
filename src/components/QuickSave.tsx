"use client";

import { useRef, useState } from "react";
import { CircleCheck, ClipboardPaste, ImagePlus, LoaderCircle, Send, TriangleAlert } from "lucide-react";
import { api, toImageInput } from "@/lib/client";

type Message = { tone: "ok" | "warn"; text: string } | null;

/** Web-only saving: paste a copied link/caption or pick screenshots. */
export default function QuickSave({ onSaved }: { onSaved: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function save(body: { text?: string; images?: Awaited<ReturnType<typeof toImageInput>>[] }) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await api<{ duplicate?: boolean }>("/api/items", body);
      setMessage(
        res.duplicate
          ? { tone: "warn", text: "이미 저장한 링크예요." }
          : { tone: "ok", text: "저장했어요! 분석이 끝나면 아래 목록에 표시돼요." },
      );
      setText("");
      onSaved();
    } catch (e) {
      setMessage({ tone: "warn", text: e instanceof Error ? e.message : "저장하지 못했어요." });
    } finally {
      setBusy(false);
    }
  }

  async function pasteFromClipboard() {
    try {
      const clip = (await navigator.clipboard.readText()).trim();
      if (!clip) {
        setMessage({ tone: "warn", text: "클립보드가 비어 있어요. 앱에서 '링크 복사'를 먼저 눌러 주세요." });
        return;
      }
      await save({ text: clip });
    } catch {
      setMessage({ tone: "warn", text: "클립보드를 읽을 수 없어요. 아래 입력창을 길게 눌러 붙여넣어 주세요." });
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
    <section className="card space-y-4 p-5">
      <button className="btn-primary w-full py-3.5 text-[15px]" onClick={pasteFromClipboard} disabled={busy}>
        {busy ? <LoaderCircle className="h-4.5 w-4.5 animate-spin" /> : <ClipboardPaste className="h-4.5 w-4.5" />}
        복사한 링크 붙여넣어 저장
      </button>

      <div className="flex items-center gap-3 font-mono text-[11px] tracking-wider text-fg-3">
        <span className="h-px flex-1 bg-line" />
        OR
        <span className="h-px flex-1 bg-line" />
      </div>

      <textarea
        ref={textareaRef}
        className="input min-h-24 resize-none"
        placeholder="링크·캡션·장소 정보를 직접 붙여넣기"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-secondary" onClick={() => save({ text })} disabled={busy || !text.trim()}>
          <Send className="h-4 w-4" />
          입력 내용 저장
        </button>
        <button className="btn-secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
          <ImagePlus className="h-4 w-4" />
          스크린샷
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      </div>

      {message && (
        <p className={`flex items-start gap-2 text-sm ${message.tone === "ok" ? "text-success" : "text-warn"}`}>
          {message.tone === "ok" ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
          {message.text}
        </p>
      )}
    </section>
  );
}
