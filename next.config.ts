import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

/** Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` (see docs/HOSTING.md). */
const nextConfig: NextConfig = {
  images: {
    // Tailscale MagicDNS resolves to 100.x — required for next/image on self-hosted homelab.
    dangerouslyAllowLocalIP: true,
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos", pathname: "/**" },
      // Supabase Storage public URLs (replace host if your project uses a custom domain)
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
      {
        protocol: "https",
        hostname: "enigma.tailf3630.ts.net",
        port: "8443",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "54321",
        pathname: "/storage/v1/object/public/**",
      },
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 31536000, // 1 year for aggressive browser/CDN caching
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
};

export default withSerwist(nextConfig);
