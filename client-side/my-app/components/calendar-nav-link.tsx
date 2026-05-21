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
  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        window.location.assign(href);
      }}
    >
      {children}
    </a>
  );
}
