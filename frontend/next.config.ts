import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Squad Builder and Optimizer were merged into My Squad as tabs.
      { source: "/squad-builder", destination: "/squad", permanent: true },
      { source: "/optimizer", destination: "/squad", permanent: true },
      // Outlook and Differentials were folded into Players as lenses.
      { source: "/outlook", destination: "/players", permanent: true },
      { source: "/differentials", destination: "/players", permanent: true },
      // Chips folded into My Squad (chip timing shows with your loaded team).
      { source: "/chips", destination: "/squad", permanent: true },
    ];
  },
};

export default nextConfig;
