// Devolve a URL só depois que a imagem carregou (sem internet, devolve null e fica o visual de reserva).
import { useEffect, useState } from "react";

export function usePreloadedImage(url) {
  const [ready, setReady] = useState(null);
  useEffect(() => {
    if (!url) return undefined;
    let alive = true;
    const img = new Image();
    img.onload = () => alive && setReady(url);
    img.src = url;
    return () => { alive = false; };
  }, [url]);
  return ready;
}
