import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Pin Turbopack root so builds don’t pick a parent folder that has another lockfile.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
