import { getSupabase } from "./supabase";
import type { ImageInput, Place } from "./types";

/** POSTs JSON to our API with the user's access token. */
export async function api<T>(path: string, body: unknown): Promise<T> {
  const { data } = await getSupabase().auth.getSession();
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${data.session?.access_token ?? ""}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `요청 실패 (${res.status})`);
  return json as T;
}

/** Downscales an image to at most 1568px on the long edge and returns it as base64 JPEG. */
export async function toImageInput(file: Blob, maxEdge = 1568): Promise<ImageInput> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { data: dataUrl.slice(dataUrl.indexOf(",") + 1), media_type: "image/jpeg" };
}

/** Runs tasks with limited parallelism, reporting progress after each one. */
export async function runPool<T>(
  inputs: T[],
  concurrency: number,
  task: (input: T) => Promise<void>,
  onProgress: (done: number) => void,
) {
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < inputs.length) {
      const input = inputs[next++];
      try {
        await task(input);
      } finally {
        onProgress(++done);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, worker));
}

export function mapLinks(place: Pick<Place, "name" | "area">) {
  const q = encodeURIComponent(`${place.name} ${place.area ?? ""}`.trim());
  return [
    { label: "카카오맵", href: `https://map.kakao.com/link/search/${q}` },
    { label: "네이버지도", href: `https://map.naver.com/p/search/${q}` },
    { label: "구글지도", href: `https://www.google.com/maps/search/?api=1&query=${q}` },
  ];
}

export function timeAgo(iso: string) {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return "방금";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
  if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR");
}

export const SOURCE_LABEL: Record<string, string> = {
  instagram: "인스타그램",
  youtube: "유튜브",
  kakaomap: "카카오맵",
  navermap: "네이버지도",
  googlemap: "구글지도",
  web: "웹",
  text: "텍스트",
  image: "스크린샷",
};
