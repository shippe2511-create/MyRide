import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ['192.168.86.109', '192.168.100.251'],
};

export default nextConfig;
