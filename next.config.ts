import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static resolves its binary path via __dirname at require-time;
  // bundling it would break that resolution, so keep it a plain runtime require.
  serverExternalPackages: ["ffmpeg-static"],
};

export default nextConfig;
