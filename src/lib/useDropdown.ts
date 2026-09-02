import { useEffect, useRef, useState } from "react";

// Shared open/close/click-outside plumbing for a button-triggered dropdown
// panel — used by both NtcaBalancePage's multi-select Quarter column
// picker and DateRangeFilterBar's single-select Quarter picker, so the two
// share the same underlying mechanism even though their selection models
// (checkbox list vs. pick-and-close) differ.
export function useDropdown<T extends HTMLElement = HTMLDivElement>() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<T>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return { open, setOpen, containerRef };
}
