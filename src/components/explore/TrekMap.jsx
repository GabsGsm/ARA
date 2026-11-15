// Mapa de contexto planetário com tiles do NASA Trek (projeção equiretangular = EPSG:4326 no Leaflet).
// Se o servidor do Trek não responder (fora do ar, lento ou bloqueado na rede), o mapa é trocado por um aviso
// em vez de ficar um quadro escuro vazio.
import { useEffect, useRef, useState } from "react";
import { loadScene } from "../../lib/terrain3d/data.js";
import L from "leaflet";
import { MapContainer, Rectangle, TileLayer } from "react-leaflet";
import { T } from "../../lib/i18n.js";

const MAX_ERRORS = 3;

// Polo sul da Lua: a projeção equiretangular do Trek estica o polo a ponto de ficar ilegível, então o contexto é
// desenhado aqui com o relevo LOLA (NASA GSFC PGDA) da cena de 180 km do polo sul, na projeção azimutal da cena.
function MoonContextMap({ site }) {
  const ref = useRef(null);
  const [state, setState] = useState("loading");
  useEffect(() => {
    let alive = true;
    loadScene("lunar_south_pole").then((sc) => {
      if (!alive || !ref.current) return;
      const { heights, n, meta, body } = sc, S = 360, cv = ref.current, g = cv.getContext("2d");
      cv.width = S; cv.height = S;
      const img = g.createImageData(S, S), step = n / S, cell = meta.size_m / n;
      const H = (x, y) => heights[Math.min(n - 1, Math.max(0, Math.round(y))) * n + Math.min(n - 1, Math.max(0, Math.round(x)))];
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        const x = i * step, y = j * step;
        const dx = (H(x + 1, y) - H(x - 1, y)) / (2 * cell), dy = (H(x, y + 1) - H(x, y - 1)) / (2 * cell);
        const shade = Math.max(0, Math.min(1, 0.55 + (-dx * 0.7 + -dy * 0.7) * 1.6));
        const v = Math.round(25 + 210 * shade), k = (j * S + i) * 4;
        img.data[k] = v; img.data[k + 1] = v; img.data[k + 2] = Math.round(v * 1.04); img.data[k + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      // lat/lon -> (u, v) pela projeção azimutal equidistante da cena
      const R = body.radius, la0 = (meta.lat * Math.PI) / 180, lo0 = (meta.lon * Math.PI) / 180;
      const toUV = (lat, lon) => {
        const la = (lat * Math.PI) / 180, dl = (lon * Math.PI) / 180 - lo0;
        const c = Math.acos(Math.min(1, Math.max(-1, Math.sin(la0) * Math.sin(la) + Math.cos(la0) * Math.cos(la) * Math.cos(dl))));
        const kk = c < 1e-9 ? 1 : c / Math.sin(c);
        const x = R * kk * Math.cos(la) * Math.sin(dl), y = R * kk * (Math.cos(la0) * Math.sin(la) - Math.sin(la0) * Math.cos(la) * Math.cos(dl));
        return [(x / meta.size_m + 0.5) * S, (0.5 - y / meta.size_m) * S];
      };
      const [w, s, e, nn] = site.bbox;
      const pts = [];
      for (let t = 0; t <= 1.0001; t += 0.05) pts.push(toUV(s, w + (e - w) * t));
      for (let t = 0; t <= 1.0001; t += 0.05) pts.push(toUV(s + (nn - s) * t, e));
      for (let t = 0; t <= 1.0001; t += 0.05) pts.push(toUV(nn, e - (e - w) * t));
      for (let t = 0; t <= 1.0001; t += 0.05) pts.push(toUV(nn - (nn - s) * t, w));
      g.fillStyle = "rgba(242,181,58,0.18)"; g.strokeStyle = "#f2b53a"; g.lineWidth = 2;
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); g.stroke();
      setState("ready");
    }).catch(() => alive && setState("error"));
    return () => { alive = false; };
  }, [site.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {state === "error"
        ? <p className="note mt-2.5 rounded-[14px] border border-dashed border-line-2 p-3">{T("Não consegui carregar o relevo do polo sul.", "Could not load the south pole relief.")}</p>
        : <canvas ref={ref} className="mt-2.5 aspect-square w-full max-w-[360px] rounded-[14px] border border-line-2 bg-black" role="img"
                  aria-label={T(`Relevo do polo sul da Lua com ${site.name} destacado`, `South pole lunar relief with ${site.name} highlighted`)} />}
      <small className="note">{T("Relevo LOLA do polo sul (NASA GSFC PGDA), 180 × 180 km centrado no polo; o quadro dourado é a região. ", "LOLA south pole relief (NASA GSFC PGDA), 180 × 180 km around the pole; the gold outline is the region. ")}
        <a href="https://trek.nasa.gov/moon/" target="_blank" rel="noopener noreferrer">{T("Abrir no Moon Trek ↗", "Open in Moon Trek ↗")}</a></small>
    </>
  );
}

export default function TrekMap({ site, layer }) {
  const [state, setState] = useState({ key: null, errors: 0, loaded: 0 });
  if (site?.body === "moon" && site?.bbox) return <MoonContextMap site={site} />;
  if (!layer || !site?.bbox) return null;
  const s0 = state.key === site.id ? state : { key: site.id, errors: 0, loaded: 0 };
  const failed = s0.errors >= MAX_ERRORS && s0.loaded === 0;
  const [w, s, e, n] = site.bbox;
  const bump = (field) => setState((prev) => {
    const base = prev.key === site.id ? prev : { key: site.id, errors: 0, loaded: 0 };
    return { ...base, [field]: base[field] + 1 };
  });

  if (failed) {
    return (
      <p className="note mt-2.5 rounded-[14px] border border-dashed border-line-2 p-3">
        {T("Mapa de contexto do NASA Mars Trek indisponível agora (o servidor de tiles não respondeu).", "NASA Mars Trek context map unavailable right now (the tile server did not respond).")}
        {" "}<a href={`https://trek.nasa.gov/mars/#v=0.1&x=${(w + e) / 2}&y=${(s + n) / 2}&z=8`} target="_blank" rel="noopener noreferrer">{T("Abrir no Mars Trek ↗", "Open in Mars Trek ↗")}</a>
      </p>
    );
  }
  return (
    <>
      <MapContainer key={site.id} crs={L.CRS.EPSG4326} center={[(s + n) / 2, (w + e) / 2]} zoom={6}
                    attributionControl={false} className="mt-2.5 h-[190px] rounded-[14px] border border-line-2 !bg-[#2a1a10]"
                    aria-label={T(`Mapa de contexto de ${site.name} (NASA Trek)`, `Context map of ${site.name} (NASA Trek)`)}>
        <TileLayer url={layer.url} maxNativeZoom={layer.max_native_zoom} maxZoom={12} noWrap
                   eventHandlers={{ tileerror: () => bump("errors"), tileload: () => bump("loaded") }} />
        <Rectangle bounds={[[s, w], [n, e]]} pathOptions={{ color: "#f2b53a", weight: 2, fillOpacity: 0.15 }} />
      </MapContainer>
      <small className="note">{layer.attribution}</small>
    </>
  );
}
