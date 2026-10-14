import React from 'react';
import { useLazyImage } from '../hooks/useLazyImage';
import { ImageIcon } from 'lucide-react';

interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  fallbackIcon?: React.ReactNode;
}

/**
 * Performant Lazy Loading Image Component
 * - Defers network request until visible in viewport via useLazyImage hook
 * - Native loading="lazy" and decoding="async"
 * - Shimmering placeholder while loading
 * - Smooth fade-in transition once loaded
 * - Elegant organic fallback on error
 */
export const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt,
  className = '',
  containerClassName = '',
  fallbackIcon,
  onClick,
  ...props
}) => {
  const { containerRef, isVisible, isLoaded, hasError, handleLoad, handleError } = useLazyImage(src);

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      className={`relative overflow-hidden bg-[#FAF6EE] select-none ${containerClassName}`}
    >
      {/* Shimmer skeleton while not loaded */}
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 bg-gradient-to-r from-[#F4EFE6] via-[#EFE6D8] to-[#F4EFE6] animate-pulse" />
      )}

      {/* Render the image once visible */}
      {isVisible && !hasError && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          className={`transition-opacity duration-500 ease-out ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          } ${className}`}
          {...props}
        />
      )}

      {/* Fallback state on error */}
      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#FAF4EA] text-[#A47922] p-4 text-center">
          {fallbackIcon || <span className="text-2xl">🌿</span>}
          <span className="text-[10px] font-bold text-[#8A6D3B] mt-1">{alt || 'محصول ناما'}</span>
        </div>
      )}
    </div>
  );
};
