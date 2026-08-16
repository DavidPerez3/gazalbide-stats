import { useCallback, useEffect, useRef, useState } from "react";
import { hapticDrop, hapticTap } from "./haptics.js";

export function usePointerDrag(onDrop) {
  const [drag, setDrag] = useState(null);
  const cleanupRef = useRef(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  const cleanup = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const startDrag = useCallback((event, item) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    cleanup();
    hapticTap();

    const pointerId = event.pointerId;
    setDrag({ item, x: event.clientX, y: event.clientY });

    const move = (nextEvent) => {
      if (nextEvent.pointerId !== pointerId) return;
      nextEvent.preventDefault();
      setDrag((current) =>
        current ? { ...current, x: nextEvent.clientX, y: nextEvent.clientY } : current
      );
    };

    const finish = (nextEvent, cancelled = false) => {
      if (nextEvent.pointerId !== pointerId) return;
      nextEvent.preventDefault();

      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      cleanupRef.current = null;

      if (!cancelled) {
        const element = document.elementFromPoint(nextEvent.clientX, nextEvent.clientY);
        const dropTarget = element?.closest?.("[data-live-drop]");
        if (dropTarget) {
          onDropRef.current?.(item, {
            kind: dropTarget.dataset.liveDrop,
            zone: dropTarget.dataset.zone || null,
            playerId: dropTarget.dataset.playerId || null,
          });
          hapticDrop();
        }
      }

      setDrag(null);
    };

    const up = (nextEvent) => finish(nextEvent, false);
    const cancel = (nextEvent) => finish(nextEvent, true);

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up, { passive: false });
    window.addEventListener("pointercancel", cancel, { passive: false });

    cleanupRef.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [cleanup]);

  return { drag, startDrag };
}
