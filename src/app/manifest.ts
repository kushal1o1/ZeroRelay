import type { MetadataRoute } from "next";

/** Path the OS posts shared files/text to (handled by the service worker). */
export const SHARE_TARGET_PATH = "/share-target";

// `share_target` isn't in Next's manifest type yet.
type Manifest = MetadataRoute.Manifest & {
  share_target: {
    action: string;
    method: "POST";
    enctype: "multipart/form-data";
    params: {
      title?: string;
      text?: string;
      url?: string;
      files?: { name: string; accept: string[] }[];
    };
  };
};

export default function manifest(): Manifest {
  return {
    id: "/",
    name: "ZeroRelay",
    short_name: "ZeroRelay",
    description: "Share files and text directly between devices. No server sees your data.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    share_target: {
      action: SHARE_TARGET_PATH,
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [{ name: "files", accept: ["*/*"] }],
      },
    },
  };
}
