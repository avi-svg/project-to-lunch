import type { CSSProperties } from "react";
import type { Shift } from "./shifts";

export type ShiftColorTheme = {
  card: string;
  badge: string;
  badgeText: string;
  dot: string;
  /** hex string or null — only set for custom-color events */
  hex: string | null;
};

const DINNER_THEME: ShiftColorTheme = {
  card: "border-emerald-200 bg-emerald-50",
  badge: "bg-emerald-600",
  badgeText: "text-white",
  dot: "bg-emerald-500",
  hex: null,
};

const CLEANING_THEME: ShiftColorTheme = {
  card: "border-blue-200 bg-blue-50",
  badge: "bg-blue-600",
  badgeText: "text-white",
  dot: "bg-blue-500",
  hex: null,
};

const DEFAULT_THEME: ShiftColorTheme = {
  card: "border-stone-200 bg-stone-50",
  badge: "bg-stone-600",
  badgeText: "text-white",
  dot: "bg-stone-500",
  hex: null,
};

export function getShiftColorTheme(shift: Pick<Shift, "shiftType" | "themeColor">): ShiftColorTheme {
  if (shift.shiftType === "dinner") return DINNER_THEME;
  if (shift.shiftType === "cleaning") return CLEANING_THEME;
  if (shift.themeColor) {
    return {
      card: "border-stone-200 bg-stone-50",
      badge: "bg-stone-600",
      badgeText: "text-white",
      dot: "bg-stone-500",
      hex: shift.themeColor,
    };
  }
  return DEFAULT_THEME;
}

export function getShiftDotStyle(
  theme: ShiftColorTheme,
): CSSProperties | undefined {
  return theme.hex ? { backgroundColor: theme.hex } : undefined;
}

export function getShiftBadgeStyle(
  theme: ShiftColorTheme,
): CSSProperties | undefined {
  return theme.hex ? { backgroundColor: theme.hex } : undefined;
}

export function getShiftCardStyle(
  theme: ShiftColorTheme,
): CSSProperties | undefined {
  return theme.hex ? { borderColor: theme.hex + "66", backgroundColor: theme.hex + "11" } : undefined;
}

export const PRESET_EVENT_COLORS = [
  { label: "סגול", hex: "#7c3aed" },
  { label: "אדום", hex: "#dc2626" },
  { label: "כתום", hex: "#ea580c" },
  { label: "צהוב", hex: "#ca8a04" },
  { label: "ירוק", hex: "#16a34a" },
  { label: "כחול", hex: "#0284c7" },
  { label: "ורוד", hex: "#db2777" },
  { label: "אפור", hex: "#475569" },
] as const;
