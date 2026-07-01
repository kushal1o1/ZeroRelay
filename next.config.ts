import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["localhost", "192.168.*", "10.*", "100.*", "127.0.0.1"],
};

export default nextConfig;
