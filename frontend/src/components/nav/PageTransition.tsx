"use client";

import { motion } from "motion/react";
import { usePathname } from "next/navigation";

// Fade/slide each route in on navigation. Keyed by pathname so the shell
// (which persists across routes) replays the enter animation per page.
// Enter-only (no exit) keeps it robust with the App Router's server-rendered
// route content.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.2, 0.7, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}
