// Turns exported files (Instagram, Google Takeout ZIPs, CSV/JSON/TXT) into an import plan.
import { strFromU8, unzipSync } from "fflate";

const MAX_LINKS = 300;
const CHUNK_SIZE = 6000;
const MAX_ZIP_BYTES = 800 * 1024 * 1024;

/** What one import run will send: links to open one by one, text chunks, and screenshots. */
export interface Plan {
  urls: string[];
  chunks: string[];
  files: File[];
  found: string[];
}

export const emptyPlan = (): Plan => ({ urls: [], chunks: [], files: [], found: [] });

export function chunkText(text: string) {
  const chunks: string[] = [];
  let current = "";
  for (const line of text.split(/\r?\n/)) {
    if (current.length + line.length > CHUNK_SIZE && current) {
      chunks.push(current);
      current = "";
    }
    current += line.slice(0, CHUNK_SIZE) + "\n";
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

function collectUrls(value: unknown, out: Set<string>) {
  if (typeof value === "string") {
    if (/^https?:\/\//.test(value) && !/(cdninstagram|fbcdn|scontent)/.test(value)) out.add(value);
  } else if (Array.isArray(value)) value.forEach((v) => collectUrls(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectUrls(v, out));
}

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const IG_POST = /^https?:\/\/(www\.)?instagram\.com\/(?:[^/]+\/)?(p|reel|reels|tv)\/[\w-]+/;
const isYoutubeCsv = (text: string) => /video id|동영상 id/i.test(text.split(/\r?\n/, 1)[0] ?? "");

/** Recognizes Instagram, YouTube and Google Maps export files among the given entries. */
export function planFromEntries(entries: { name: string; text: string }[]): Plan {
  const plan = emptyPlan();
  const fileName = (path: string) => path.split("/").pop() ?? path;

  // Instagram "Export your information": saved / liked post lists (JSON or HTML) holding post links.
  const ig = new Set<string>();
  for (const e of entries) {
    if (!/(saved|like)/i.test(fileName(e.name)) || /comment/i.test(e.name)) continue;
    const urls = new Set<string>();
    if (/\.json$/i.test(e.name)) collectUrls(parseJson(e.text), urls);
    else if (/\.html?$/i.test(e.name)) for (const m of e.text.matchAll(/href="([^"]+)"/g)) urls.add(m[1]);
    urls.forEach((u) => IG_POST.test(u) && ig.add(u));
  }
  if (ig.size) plan.found.push(`인스타그램 저장·좋아요 게시물 링크 ${ig.size}개`);

  // YouTube Takeout playlists: one CSV per playlist, liked videos included.
  const ytCsvs = entries.filter((e) => /\.csv$/i.test(e.name) && isYoutubeCsv(e.text));
  const liked = ytCsvs.filter((e) => /liked|좋아요/i.test(fileName(e.name)));
  const yt = new Set<string>();
  for (const e of liked.length ? liked : ytCsvs) {
    for (const row of e.text.split(/\r?\n/).slice(1)) {
      const id = row.split(",")[0]?.trim();
      if (/^[\w-]{11}$/.test(id)) yt.add(`https://www.youtube.com/watch?v=${id}`);
    }
  }
  if (yt.size) plan.found.push(`유튜브 ${liked.length ? "좋아요 표시한" : "재생목록"} 영상 ${yt.size}개`);

  // Google Takeout "Saved": one CSV per list (Title, Note, URL, Comment).
  const lists = entries.filter((e) => {
    const header = e.text.split(/\r?\n/, 1)[0] ?? "";
    return /\.csv$/i.test(e.name) && !/youtube/i.test(e.name) && /title|제목/i.test(header) && /url/i.test(header);
  });
  if (lists.length) {
    plan.found.push(`구글 지도 저장 목록 ${lists.length}개`);
    plan.chunks.push(...chunkText(lists.map((e) => `[목록: ${fileName(e.name).replace(/\.csv$/i, "")}]\n${e.text}`).join("\n")));
  }

  // Google Takeout "Maps (your places)": GeoJSON of starred places.
  for (const e of entries) {
    const json = /\.json$/i.test(e.name) ? (parseJson(e.text) as { features?: { properties?: unknown }[] } | null) : null;
    if (!Array.isArray(json?.features)) continue;
    plan.found.push(`구글 지도 별표 장소 ${json.features.length}곳`);
    plan.chunks.push(...chunkText(json.features.map((f) => JSON.stringify(f.properties)).join("\n")));
  }

  plan.urls = [...ig, ...yt].slice(0, MAX_LINKS);
  if (ig.size + yt.size > MAX_LINKS) plan.found.push(`링크는 한 번에 ${MAX_LINKS}개까지만 가져와요`);
  return plan;
}

export async function planFromFile(file: File): Promise<Plan> {
  if (/\.zip$/i.test(file.name)) {
    if (file.size > MAX_ZIP_BYTES) throw new Error("파일이 너무 커요. 사진·동영상을 빼고(필요한 항목만 선택) 다시 내보내 주세요.");
    const unzipped = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (f) => /\.(json|csv|html?)$/i.test(f.name) && f.originalSize < 30 * 1024 * 1024,
    });
    const entries = Object.entries(unzipped).map(([name, data]) => ({ name, text: strFromU8(data) }));
    const plan = planFromEntries(entries);
    if (!plan.urls.length && !plan.chunks.length) throw new Error("ZIP 안에서 가져올 수 있는 저장 목록을 찾지 못했어요. 아래 안내대로 내보냈는지 확인해 주세요.");
    return plan;
  }

  const text = await file.text();
  const plan = planFromEntries([{ name: file.name, text }]);
  if (plan.urls.length || plan.chunks.length) return plan;
  // Any other file: links inside JSON, otherwise plain text.
  const urls = new Set<string>();
  if (/\.json$/i.test(file.name)) collectUrls(parseJson(text), urls);
  if (urls.size) return { ...emptyPlan(), urls: [...urls].slice(0, MAX_LINKS), found: [`링크 ${urls.size}개`] };
  const chunks = chunkText(text);
  return { ...emptyPlan(), chunks, found: [`텍스트 ${chunks.length}묶음`] };
}

