import { useCallback, useEffect, useRef } from 'react';

export function useScrollHold(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  direction: 'left' | 'right'
) {
  const intervalRef = useRef<number | null>(null);

  const start = useCallback(() => {
    if (intervalRef.current !== null) return;
    const step = direction === 'left' ? -20 : 20;
    const scroll = () => scrollRef.current?.scrollBy({ left: step, behavior: 'auto' });
    scroll();
    intervalRef.current = window.setInterval(scroll, 30);
  }, [scrollRef, direction]);

  const stop = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, []);

  // Safety net: if the button vanishes mid-press (arrow hidden, grid resized),
  // the local onMouseUp/onTouchEnd never fire — listen at window level too.
  useEffect(() => {
    const handler = () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    window.addEventListener('mouseup', handler);
    window.addEventListener('touchend', handler);
    window.addEventListener('touchcancel', handler);
    return () => {
      window.removeEventListener('mouseup', handler);
      window.removeEventListener('touchend', handler);
      window.removeEventListener('touchcancel', handler);
    };
  }, []);

  return { start, stop };
}
