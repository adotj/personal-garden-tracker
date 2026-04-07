'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Options = {
  threshold?: number;
  maxPull?: number;
  disabled?: boolean;
};

/**
 * Mobile-style pull-down to refresh when the page is scrolled to the top.
 */
export function usePullToRefresh(
  onRefresh: () => void | Promise<void>,
  { threshold = 72, maxPull = 120, disabled = false }: Options = {},
) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const pullDistanceRef = useRef(0);
  const startYRef = useRef(0);
  const trackingRef = useRef(false);
  const refreshingRef = useRef(false);
  const refreshFn = useRef(onRefresh);
  refreshFn.current = onRefresh;

  const scrollTop = useCallback(
    () => window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0,
    [],
  );

  useEffect(() => {
    if (disabled) return;

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (e.touches.length !== 1) return;
      if (scrollTop() > 8) return;
      startYRef.current = e.touches[0].clientY;
      trackingRef.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!trackingRef.current || refreshingRef.current) return;
      if (scrollTop() > 8) {
        pullDistanceRef.current = 0;
        setPullDistance(0);
        trackingRef.current = false;
        return;
      }
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy > 0) {
        e.preventDefault();
        const d = Math.min(dy, maxPull);
        pullDistanceRef.current = d;
        setPullDistance(d);
      }
    };

    const endPull = async () => {
      if (!trackingRef.current) {
        pullDistanceRef.current = 0;
        setPullDistance(0);
        return;
      }
      trackingRef.current = false;
      const d = pullDistanceRef.current;
      pullDistanceRef.current = 0;
      setPullDistance(0);

      if (d < threshold || refreshingRef.current) return;

      refreshingRef.current = true;
      setIsRefreshing(true);
      try {
        await refreshFn.current();
      } finally {
        refreshingRef.current = false;
        setIsRefreshing(false);
      }
    };

    const onTouchEnd = () => {
      void endPull();
    };

    const onTouchCancel = () => {
      trackingRef.current = false;
      pullDistanceRef.current = 0;
      setPullDistance(0);
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [disabled, maxPull, threshold, scrollTop]);

  return { pullDistance, isRefreshing, threshold, maxPull };
}
