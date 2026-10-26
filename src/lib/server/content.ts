// Best-effort retrieval of readable text behind a shared link.
// Every fetcher swallows its own errors: missing text is handled downstream
// by asking the user to paste the caption or attach a screenshot.

const BROWSER_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const PREVIEW_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const MAX_TEXT = 6000;

export function detectSource(url: string | null): string {
  if (!url) return "text";
  const host = safeHost(url);
  if (/instagram\.com$/.test(host)) return "instagram";
  if (/(youtube\.com|youtu\.be)$/.test(host)) return "youtube";
  if (/(kko\.to|kakao\.com)$/.test(host)) return "kakaomap";
  if (/(naver\.me|map\.naver\.com)$/.test(host)) return "navermap";
  if (/(maps\.app\.goo\.gl|goo\.gl)$/.test(host) || /google\.[a-z.]+\/maps/.test(url)) return "googlemap";
  return "web";
}

export function findUrl(text: string | null | undefined): string | null {
  return text?.match(/https?:\/\/[^\s<>"']+/)?.[0] ?? null;
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

async function fetchPage(url: string, userAgent = BROWSER_UA) {
  const res = await fetch(url, {
    headers: { "user-agent": userAgent, "accept-language": "ko-KR,ko;q=0.9,en;q=0.8" },
    redirect: "follow",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { html: (await res.text()).slice(0, 1_500_000), finalUrl: res.url };
}

function decodeEntities(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function meta(html: string, key: string) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`,
    "i",
  );
  const m = html.match(re);
  return m ? decodeEntities(m[1] ?? m[2] ?? "").trim() : "";
}

function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function pageSummary(html: string, finalUrl: string) {
  const lines = [
    finalUrl && `최종 주소: ${finalUrl}`,
    meta(html, "og:title") && `제목: ${meta(html, "og:title")}`,
    (meta(html, "og:description") || meta(html, "description")) &&
      `설명: ${meta(html, "og:description") || meta(html, "description")}`,
  ];
  return lines.filter(Boolean).join("\n");
}

// Instagram serves the caption in og: tags only to link-preview crawlers;
// deleted or private posts (and blocked server IPs) come back without them.
async function instagram(url: string) {
  const code = url.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/)?.[1];
  const { html } = await fetchPage(code ? `https://www.instagram.com/p/${code}/` : url, PREVIEW_UA);
  return pageSummary(html, "");
}

function youtubeId(url: string) {
  return (
    url.match(/youtu\.be\/([\w-]{11})/)?.[1] ??
    url.match(/[?&]v=([\w-]{11})/)?.[1] ??
    url.match(/youtube\.com\/(?:shorts|embed|live)\/([\w-]{11})/)?.[1] ??
    null
  );
}

async function youtube(url: string) {
  const id = youtubeId(url);
  if (!id) return "";
  const parts: string[] = [];
  try {
    const { html } = await fetchPage(`https://www.youtube.com/watch?v=${id}&hl=ko`);
    const title = meta(html, "og:title");
    if (title) parts.push(`제목: ${title}`);
    const desc = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/)?.[1];
    if (desc) parts.push(`설명: ${JSON.parse(`"${desc}"`)}`);
    else if (meta(html, "og:description")) parts.push(`설명: ${meta(html, "og:description")}`);
  } catch {}
  if (!parts.length) {
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (res.ok) {
        const o = (await res.json()) as { title?: string; author_name?: string };
        parts.push(`제목: ${o.title ?? ""}\n채널: ${o.author_name ?? ""}`);
      }
    } catch {}
  }
  return parts.join("\n");
}

async function naverBlog(url: string) {
  const m = url.match(/blog\.naver\.com\/([\w-]+)\/(\d+)/);
  const target = m ? `https://m.blog.naver.com/${m[1]}/${m[2]}` : url;
  const { html, finalUrl } = await fetchPage(target);
  return `${pageSummary(html, finalUrl)}\n본문: ${htmlToText(html).slice(0, MAX_TEXT)}`;
}

async function generic(url: string, withBody: boolean) {
  const { html, finalUrl } = await fetchPage(url);
  let text = pageSummary(html, finalUrl);
  // Google Maps short links resolve to /maps/place/<name>/..., which names the place.
  const gPlace = finalUrl.match(/\/maps\/place\/([^/]+)/)?.[1];
  if (gPlace) text += `\n지도 장소명: ${decodeURIComponent(gPlace.replace(/\+/g, " "))}`;
  if (withBody) text += `\n본문: ${htmlToText(html).slice(0, MAX_TEXT)}`;
  return text;
}

export async function fetchContent(url: string, source: string): Promise<string> {
  try {
    if (source === "instagram") return await instagram(url);
    if (source === "youtube") return await youtube(url);
    if (/blog\.naver\.com/.test(url)) return await naverBlog(url);
    const isMap = ["kakaomap", "navermap", "googlemap"].includes(source);
    return await generic(url, !isMap);
  } catch {
    return "";
  }
}
