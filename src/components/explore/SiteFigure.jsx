import { useState } from "react";
import TrekMap from "./TrekMap.jsx";
import { useAraData } from "../../hooks/useAraData.jsx";
import { dataUrl, fmt } from "../../lib/format.js";

export default function SiteFigure({ siteId }) {
  const data = useAraData();
  const [broken, setBroken] = useState(null);
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
  return (
    <figure className="mx-0 mb-1.5 mt-3.5">
      <div className="relative overflow-hidden rounded-[14px] border border-line-2">
        {img.src && broken !== img.src
          ? <img src={dataUrl(img.src)} alt={alt} className="block h-auto w-full" onError={() => setBroken(img.src)} />
          : <p className="note p-4">Imagem pendente</p>}
        {box && <span className="absolute border-2 border-[#fff4d6] bg-gold/25 shadow-[0_0_12px_rgb(242_181_58/.6)]" style={box} />}
      </div>
      <figcaption className="mt-1.5 text-xs text-muted">
        {img.caption}<br />{site.why}
        {site.center_pending_validation && <><br /><span className="text-warn">Centro do recorte aguardando validação final.</span></>}
      </figcaption>
      <TrekMap site={site} layer={data.config.planet_maps?.[site.body]} />
    </figure>
  );
}
