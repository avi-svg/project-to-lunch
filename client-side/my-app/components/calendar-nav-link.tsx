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
      className={`${className} relative z-10 cursor-pointer pointer-events-auto`}
    >
      {children}
    </a>
  );
}
