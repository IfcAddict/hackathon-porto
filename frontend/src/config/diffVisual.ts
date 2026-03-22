/** ADR defaults; override with VITE_COLOR_DELETED etc. */
export const DIFF_COLORS = {
  deleted: import.meta.env.VITE_COLOR_DELETED ?? "#EF4444",
  added: import.meta.env.VITE_COLOR_ADDED ?? "#10B981",
  modified: import.meta.env.VITE_COLOR_MODIFIED ?? "#F59E0B",
} as const;
