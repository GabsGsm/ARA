// Alto contraste: classe "hc" no <html>, lembrada neste navegador.
import { useEffect, useState } from "react";

const KEY = "ara-high-contrast";

function readSaved() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}

export function useHighContrast() {
  const [on, setOn] = useState(readSaved);
  useEffect(() => {
    document.documentElement.classList.toggle("hc", on);
    try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* armazenamento indisponível */ }
  }, [on]);
  return [on, () => setOn((v) => !v)];
}
