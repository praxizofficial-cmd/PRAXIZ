"use client";
import { useState, type PointerEvent, type FocusEvent } from "react";

/** Previews never overwrite the committed choice. Pointer focus is not keyboard focus. */
export function usePublicPreview(initial = 0) {
  const [selected, setSelected] = useState(initial);
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const select = (index: number) => { setSelected(index); setHovered(null); setFocused(null); };
  return {
    selected, active: hovered ?? focused ?? selected, select,
    controls: (index: number) => ({
      "aria-pressed": selected === index,
      onPointerEnter: (event: PointerEvent) => { if (event.pointerType !== "touch") setHovered(index); },
      onPointerLeave: () => setHovered(null),
      onFocus: (event: FocusEvent<HTMLButtonElement>) => { if (event.currentTarget.matches(":focus-visible")) setFocused(index); },
      onBlur: () => setFocused(null),
      onClick: () => select(index),
    }),
  };
}
