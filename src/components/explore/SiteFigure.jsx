// Imagem do local fixo (relevo em falsa cor + quadrado da célula de 5 km) com opção de ampliar,
// e o mapa de contexto do NASA Trek (opcional, usado na aba Fontes).
import { useState } from "react";
import TrekMap from "./TrekMap.jsx";
import ImageViewer from "./ImageViewer.jsx";
import { useAraData } from "../../hooks/useAraData.jsx";
import { dataUrl, fmt } from "../../lib/format.js";

export function useSiteImage(siteId) {
  const data = useAraData();
  const site = data.siteById(siteId);
  if (!site) return null;
  const img = site.image ?? {};
  const t = data.sites[site.id]?.terrain;
  const alt = `${site.name}: recorte de 5 × 5 km. Declividade média ${fmt(t?.slope_mean_deg)}°, rugosidade média ${fmt(t?.roughness_mean_m)} m, amplitude ${fmt(t?.relief_m, 0)} m.`;
  let box = null;
  if (img.box_px && img.frame_px) {
    const [x, y, w, h] = img.box_px;
    const [fw, fh] = img.frame_px;
    box = { left: `${(x / fw) * 100}%`, top: `${(y / fh) * 100}%`, width: `${(w / fw) * 100}%`, height: `${(h / fh) * 100}%` };
  }
  return { site, img, alt, box };
}

export default function SiteFigure({ siteId, compact = false, showTrek = true }) {
  const data = useAraData();
  const [broken, setBroken] = useState(null);
  const [open, setOpen] = useState(false);
  const info = useSiteImage(siteId);
  if (!info) return null;
  const { site, img, alt, box } = info;
  const ok = img.src && broken !== img.src;
  return (
    <figure className={`mx-0 mb-1.5 ${compact ? "mt-0" : "mt-3.5"}`}>
      <div className="group relative overflow-hidden rounded-[14px] border border-line-2 bg-petrol-950/60">
        {ok
          ? <img src={dataUrl(img.src)} alt={alt} className="block h-auto w-full" onError={() => setBroken(img.src)} />
          : <p className="note p-4">Imagem pendente</p>}
        {box && <span className="absolute border-2 border-[#fff4d6] bg-gold/25 shadow-[0_0_12px_rgb(242_181_58/.6)]" style={box} />}
        {ok && (
          <button type="button" onClick={() => setOpen(true)} className="ex-zoom-btn" aria-label={`Ampliar a imagem de ${site.name}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4a6 6 0 1 0 3.7 10.7l4.3 4.3 1.4-1.4-4.3-4.3A6 6 0 0 0 10 4zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm-1 1v2H7v2h2v2h2v-2h2V9h-2V7H9z" fill="currentColor" /></svg>
            Ampliar
          </button>
        )}
      </div>
      <figcaption className="mt-1.5 text-xs text-muted">
        {img.caption}{!compact && <><br />{site.why}</>}
        {site.center_pending_validation && <><br /><span className="text-warn">Centro do recorte aguardando validação final.</span></>}
      </figcaption>
      {showTrek && <TrekMap site={site} layer={data.config.planet_maps?.[site.body]} />}
      {open && <ImageViewer src={dataUrl(img.src)} alt={alt} caption={`${site.name} — ${img.caption ?? ""}`} overlay={box} onClose={() => setOpen(false)} />}
    </figure>
  );
}
