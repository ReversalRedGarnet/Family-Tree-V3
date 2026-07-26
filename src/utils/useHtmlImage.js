import { useEffect, useState } from 'react';

// Loads a raster image (e.g. a base64 photo data URL) for use as a Konva
// <Image image={...} /> source. Returns null while loading or if loading
// fails, so callers can safely fall back to rendering nothing.
export default function useHtmlImage(src) {
  const [image, setImage] = useState(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (!cancelled) setImage(img);
    };
    img.onerror = () => {
      if (!cancelled) setImage(null);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return image;
}
