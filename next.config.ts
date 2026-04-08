import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

/** Deployed on Vercel — set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the project env. */
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos", pathname: "/**" },
      // Supabase Storage public URLs (replace host if your project uses a custom domain)
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
};

export default withSerwist(nextConfig);
