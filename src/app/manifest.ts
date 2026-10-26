import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "핫플비서",
    short_name: "핫플비서",
    description: "SNS에서 본 핫플을 모아 두고 약속 장소를 추천받아요",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0b0d",
    theme_color: "#111317",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Registers the installed app in Android's share sheet (links, text and screenshots).
    share_target: {
      action: "/share-target",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [{ name: "images", accept: ["image/*"] }],
      },
    },
  };
}
