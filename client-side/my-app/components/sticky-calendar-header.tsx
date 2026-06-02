"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

export function StickyCalendarHeader({
  viewButtons,
  navRow,
}: {
  viewButtons: ReactNode;
  navRow: ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <div
      className={`sticky top-0 z-20 flex flex-col rounded-[2rem] border border-stone-200 bg-white/95 shadow-sm backdrop-blur-sm transition-all duration-300 ${
        scrolled ? "gap-2 p-3" : "gap-4 p-6"
      }`}
    >
      <div
        className={`overflow-hidden transition-all duration-300 ${
          scrolled ? "max-h-0 opacity-0" : "max-h-32 opacity-100"
        }`}
      >
        {viewButtons}
      </div>
      {navRow}
    </div>
  );
}
