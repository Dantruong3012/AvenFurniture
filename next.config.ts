import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { getSupabaseConfig } from "./lib/supabase/config";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Next 16 logs Server Function arguments in development by default.
  // Auth forms and MFA responses contain secrets: disable framework dev logs.
  logging: false,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ] }];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
      ...(cloudName && /^[a-zA-Z0-9_-]+$/.test(cloudName) ? [{ protocol: "https" as const, hostname: "res.cloudinary.com", pathname: `/${cloudName}/image/upload/**` }] : []),
    ],
  },
};

export default function config(phase: string): NextConfig {
  // Dynamic routes may never execute during build. Validate before bundling so
  // missing public env cannot produce a READY deployment that fails on request.
  if (phase === PHASE_PRODUCTION_BUILD) getSupabaseConfig();
  return nextConfig;
}
