import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import BrandMark from "./BrandMark.jsx";
import { useHighContrast } from "../../hooks/useHighContrast.js";

const LINKS = [
  { to: "/", label: "Início", end: true },
  { to: "/explorar", label: "Explorar" },
  { to: "/analises", label: "Análises" },
  { to: "/sobre", label: "Sobre" },
];

export default function Header() {
  const [open, setOpen] = useState(false);
  const [hc, toggleHc] = useHighContrast();
  const linkCls = ({ isActive }) =>
    `relative py-1.5 text-base no-underline ${isActive ? "nav-active text-gold" : "text-ink hover:text-gold-2"}`;

  return (
    <header className="sticky top-3.5 z-[1000] mx-3 mt-3.5 flex items-center justify-between gap-4 rounded-[18px] border border-line bg-petrol-950/75 px-4 py-2.5 backdrop-blur-lg sm:mx-[clamp(12px,2vw,30px)] sm:px-6">
      <Link to="/" className="flex items-center gap-4 text-ink no-underline" aria-label="ARA, página inicial">
        <BrandMark />
        <span className="hidden flex-col border-l border-line pl-4 lg:flex">
          <strong className="font-display text-[26px] font-normal leading-none tracking-[0.08em]">ARA</strong>
          <small className="mt-1.5 font-display text-[10px] uppercase tracking-[0.4em] text-ink-2">Analog Research &amp; Analysis</small>
        </span>
      </Link>

      <nav aria-label="Principal" className="relative">
        <button type="button" className="cursor-pointer p-2 md:hidden" aria-expanded={open} aria-controls="navLinks"
                aria-label={open ? "Fechar menu" : "Abrir menu"} onClick={() => setOpen((v) => !v)}>
          {[0, 1, 2].map((i) => <span key={i} className="my-[7px] block h-0.5 w-8 rounded bg-ink" />)}
        </button>
        <ul id="navLinks"
            className={`${open ? "flex" : "hidden"} absolute right-0 top-14 m-0 list-none flex-col items-start gap-3.5 rounded-[18px] border border-line bg-petrol-950/95 px-6 py-4
                        md:static md:flex md:flex-row md:items-center md:gap-[clamp(14px,3vw,46px)] md:border-0 md:bg-transparent md:p-0`}>
          {LINKS.map((l) => (
            <li key={l.to}><NavLink to={l.to} end={l.end} className={linkCls} onClick={() => setOpen(false)}>{l.label}</NavLink></li>
          ))}
          <li>
            <button type="button" aria-pressed={hc} onClick={toggleHc} className="cursor-pointer text-[13px] text-muted hover:text-ink">
              Alto contraste
            </button>
          </li>
        </ul>
      </nav>
    </header>
  );
}
