// Fallback for share-sheet POSTs that arrive before the service worker is active:
// keeps the text fields (images are dropped) and forwards them to /share.
export async function POST(request: Request) {
  const form = await request.formData();
  const params = new URLSearchParams();
  for (const key of ["title", "text", "url"]) {
    const value = form.get(key);
    if (typeof value === "string" && value) params.set(key, value);
  }
  return Response.redirect(new URL(`/share?${params}`, request.url), 303);
}

export function GET(request: Request) {
  return Response.redirect(new URL("/share", request.url), 303);
}
