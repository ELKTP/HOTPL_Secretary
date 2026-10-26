// Receives Android share-sheet POSTs, parks the payload in Cache Storage,
// and hands off to /share, which uploads it with the signed-in user's token.
const SHARE_CACHE = "share-target";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== "/share-target") return;

  event.respondWith(
    (async () => {
      const form = await event.request.formData();
      const cache = await caches.open(SHARE_CACHE);
      for (const key of await cache.keys()) await cache.delete(key);

      const meta = {
        title: form.get("title") || "",
        text: form.get("text") || "",
        url: form.get("url") || "",
        files: [],
      };
      const files = form.getAll("images").filter((f) => typeof f !== "string");
      for (let i = 0; i < files.length; i++) {
        const key = `/share-target/file-${i}`;
        await cache.put(key, new Response(files[i], { headers: { "content-type": files[i].type } }));
        meta.files.push(key);
      }
      await cache.put("/share-target/meta", Response.json(meta));
      return Response.redirect(new URL("/share?from=sw", self.location.origin).href, 303);
    })(),
  );
});
