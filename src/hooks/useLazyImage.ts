import { useState, useEffect, useRef } from 'react';

interface UseLazyImageOptions {
  rootMargin?: string;
  threshold?: number;
}

/**
 * Custom React hook for performant lazy loading of images
 * Uses IntersectionObserver to defer loading until the image enters or approaches the viewport
 */
export function useLazyImage(src: string, options: UseLazyImageOptions = {}) {
  const { rootMargin = '150px', threshold = 0.01 } = options;
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // If IntersectionObserver is not supported (legacy), load immediately
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin, threshold }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [rootMargin, threshold]);

  const handleLoad = () => {
    setIsLoaded(true);
    setHasError(false);
  };

  const handleError = () => {
    setIsLoaded(true);
    setHasError(true);
  };

  return {
    containerRef,
    isVisible,
    isLoaded,
    hasError,
    handleLoad,
    handleError,
  };
}
