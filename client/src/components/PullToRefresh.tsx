import { useEffect, useRef, useState, type ReactNode } from 'react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
}

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [success, setSuccess] = useState(false);

  const startYRef = useRef<number | null>(null);
  const isPullingRef = useRef(false);

  const THRESHOLD = 65; // px required to trigger

  useEffect(() => {
    let startY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY <= 2 && !refreshing) {
        startY = e.touches[0].clientY;
        startYRef.current = startY;
        isPullingRef.current = true;
      } else {
        isPullingRef.current = false;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPullingRef.current || startYRef.current === null || refreshing) return;
      const currentY = e.touches[0].clientY;
      const diff = currentY - startYRef.current;

      if (diff > 0 && window.scrollY <= 2) {
        // Apply smooth resistance curve
        const dist = Math.min(85, Math.pow(diff, 0.85));
        setPullDistance(dist);
      } else {
        setPullDistance(0);
      }
    };

    const handleTouchEnd = async () => {
      if (!isPullingRef.current || startYRef.current === null) return;
      isPullingRef.current = false;
      startYRef.current = null;

      if (pullDistance >= THRESHOLD && !refreshing) {
        setRefreshing(true);
        setPullDistance(50); // Hold at refreshing position
        try {
          await Promise.all([
            Promise.resolve(onRefresh()),
            new Promise((res) => setTimeout(res, 600)), // Visual minimum
          ]);
          setSuccess(true);
          await new Promise((res) => setTimeout(res, 400));
        } catch {
          // ignore
        } finally {
          setSuccess(false);
          setRefreshing(false);
          setPullDistance(0);
        }
      } else {
        setPullDistance(0);
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onRefresh, pullDistance, refreshing]);

  const progress = Math.min(1, pullDistance / THRESHOLD);
  const showIndicator = pullDistance > 0 || refreshing;

  return (
    <div style={{ position: 'relative' }}>
      {/* Pull down indicator */}
      {showIndicator && (
        <div
          style={{
            position: 'fixed',
            top: 64,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 999,
            pointerEvents: 'none',
            transform: `translateY(${pullDistance * 0.35}px)`,
            opacity: refreshing ? 1 : Math.max(0.2, progress),
            transition: isPullingRef.current ? 'none' : 'all 0.3s ease',
          }}
        >
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.92)',
              border: `1px solid ${success ? 'rgba(52, 211, 153, 0.4)' : 'rgba(255, 255, 255, 0.15)'}`,
              borderRadius: 24,
              padding: '6px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              backdropFilter: 'blur(8px)',
            }}
          >
            {success ? (
              <>
                <span style={{ color: '#34d399', fontSize: 13 }}>✓</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#34d399' }}>Päivitetty!</span>
              </>
            ) : refreshing ? (
              <>
                <div
                  style={{
                    width: 14,
                    height: 14,
                    border: '2px solid rgba(255,255,255,0.2)',
                    borderTopColor: 'var(--heat-primary)',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Päivitetään tietoja...</span>
              </>
            ) : (
              <>
                <span
                  style={{
                    fontSize: 13,
                    display: 'inline-block',
                    transform: `rotate(${progress * 180}deg)`,
                    transition: 'transform 0.1s',
                  }}
                >
                  ↓
                </span>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
                  {progress >= 1 ? 'Vapauta päivittääksesi' : 'Vedä alas päivittääksesi'}
                </span>
              </>
            )}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
