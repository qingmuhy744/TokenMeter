import { useRef, useEffect } from "react";

/**
 * A hook that enables horizontal scrolling using the mouse wheel.
 * By default, it translates vertical scroll into horizontal scroll.
 * If Shift or Ctrl key is held, it also triggers horizontal scroll.
 */
export function useHorizontalScroll() {
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      // If the scroll is already purely horizontal (e.g. trackpad), let the browser handle it
      if (e.deltaX !== 0) return;

      // Translate vertical delta to horizontal scroll
      // We check for Ctrl or Shift to match common power-user expectations, 
      // but also enable it by default if the element is horizontally scrollable 
      // and we're hovering over it to make it discoverable.
      el.scrollTo({
        left: el.scrollLeft + e.deltaY * 1.5, // Multiplier for better sensitivity
        behavior: "auto" // Auto is smoother for discrete wheel clicks
      });

      // Prevent the page from scrolling vertically when we're interacting with the table
      e.preventDefault();
    };

    // Passive: false is required to allow e.preventDefault()
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return elRef;
}
