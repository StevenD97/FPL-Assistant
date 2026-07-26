import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Squad Builder and Optimizer were merged into My Squad as tabs.
      { source: "/squad-builder", destination: "/squad", permanent: true },
      { source: "/optimizer", destination: "/squad", permanent: true },
    ];
  },
};

export default nextConfig;
