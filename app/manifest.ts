import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Laveen Garden",
    short_name: "Garden",
    description: "Track plants, watering, and care for a desert container garden.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#c4bbb0",
    theme_color: "#0d4f27",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
