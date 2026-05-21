"use client";

import type { ReactNode } from "react";

type CalendarNavLinkProps = {
  href: string;
  className: string;
  children: ReactNode;
  prefetch?: boolean;
};

export function CalendarNavLink({
  href,
  className,
  children,
}: CalendarNavLinkProps) {
  function buildNavigationHref() {
    if (typeof window === "undefined") {
      return href;
    }

    const url = new URL(href, window.location.origin);
    url.searchParams.set("__nav", Date.now().toString());
    return `${url.pathname}${url.search}`;
  }

  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        window.location.assign(buildNavigationHref());
      }}
    >
      {children}
    </a>
  );
}
