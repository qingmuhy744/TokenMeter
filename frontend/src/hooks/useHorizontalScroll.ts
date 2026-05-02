import { useRef, useEffect } from "react";

/**
 * A hook that enables horizontal scrolling using the mouse wheel AND mouse drag.
 */
export function useHorizontalScroll() {
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    // --- 1. Mouse Wheel to Horizontal Scroll ---
    const onWheel = (e: WheelEvent) => {
      // If the scroll is already purely horizontal (e.g. trackpad), let the browser handle it
      if (e.deltaX !== 0) return;

      el.scrollTo({
        left: el.scrollLeft + e.deltaY * 1.5,
        behavior: "auto"
      });
      e.preventDefault();
    };

    // --- 2. Mouse Drag to Scroll ---
    let isDown = false;
    let startX: number;
    let scrollLeft: number;

    const onMouseDown = (e: MouseEvent) => {
      // Don't intercept clicks on interactive elements
      const target = e.target as HTMLElement;
      if (['INPUT', 'BUTTON', 'A', 'LABEL', 'SELECT'].includes(target.tagName) || target.closest('button') || target.closest('input')) {
        return;
      }
      
      isDown = true;
      el.style.cursor = 'grabbing';
      el.style.userSelect = 'none'; // Prevent text selection while dragging
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
    };

    const onMouseLeave = () => {
      isDown = false;
      el.style.cursor = 'grab';
      el.style.removeProperty('user-select');
    };

    const onMouseUp = () => {
      isDown = false;
      el.style.cursor = 'grab';
      el.style.removeProperty('user-select');
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - el.offsetLeft;
      const walk = (x - startX) * 1.5; // Scroll speed multiplier
      el.scrollLeft = scrollLeft - walk;
    };

    // Initialize cursor
    el.style.cursor = 'grab';

    // Attach events
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("mousedown", onMouseDown);
    el.addEventListener("mouseleave", onMouseLeave);
    el.addEventListener("mouseup", onMouseUp);
    el.addEventListener("mousemove", onMouseMove);

    return () => {
      // Cleanup
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("mousedown", onMouseDown);
      el.removeEventListener("mouseleave", onMouseLeave);
      el.removeEventListener("mouseup", onMouseUp);
      el.removeEventListener("mousemove", onMouseMove);
      el.style.removeProperty('cursor');
    };
  }, []);

  return elRef;
}
