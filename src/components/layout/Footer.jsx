import { useTr } from "../../hooks/useSettings.jsx";

export default function Footer() {
  const tr = useTr();
  return (
    <footer className="mx-auto mt-8 max-w-[1640px] border-t border-line-2 px-[clamp(12px,2vw,30px)] pb-7 pt-4 text-xs text-muted">
      {tr("Dados", "Data")}: NASA/USGS CTX DEM · CRISM (Valantinas et al. 2026) · Mars Odyssey THEMIS · LRO LOLA {tr("e", "and")} Diviner ·
      Chandrayaan-1 M3 · NASA Mars Trek · NASA GIBS · Mapzen Terrain Tiles · Macrostrat · ISRIC SoilGrids · NASA POWER. {tr("Modelos 3D", "3D models")}: NASA ({tr("domínio público", "public domain")}). {tr("Mapa base", "Base map")}: Esri World Imagery.
    </footer>
  );
}
