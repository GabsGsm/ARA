// Globo com textura real do NASA Trek (quando há internet) e degradê de reserva.
import { Link } from "react-router-dom";
import { usePreloadedImage } from "../../hooks/usePreloadedImage.js";
import Pill from "../ui/Pill.jsx";

export default function Planet({ body, label, textureUrl, to, icon, gold = false, sizeClass }) {
  const tex = usePreloadedImage(textureUrl);
  return (
    <div className="group relative flex min-w-0 flex-col items-center gap-5 sm:gap-8">
      <Link to={to} aria-label={`Explorar ${label}`} className={`block ${sizeClass}`}>
        <span className={`planet planet-${body} w-full`} style={tex ? { "--tex": `url("${tex}")` } : undefined} aria-hidden="true" />
      </Link>
      <Pill to={to} variant={gold ? "gold" : "light"} icon={icon} className="max-sm:px-4 max-sm:py-2.5 max-sm:text-xs">
        {label}
      </Pill>
    </div>
  );
}
