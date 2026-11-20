import type { NextConfig } from "next";

/**
 * The Cloud preview serves this dev server through a per-VM hostname. Keep that
 * hostname out of the repo by reading it from the environment.
 */
const allowedDevOrigins = (process.env.NEXT_ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
};

export default nextConfig;
