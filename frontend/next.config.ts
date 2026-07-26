import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Squad Builder was merged into My Squad as a "Build from scratch" mode.
      { source: "/squad-builder", destination: "/squad", permanent: true },
    ];
  },
};

export default nextConfig;
