// Topo: logo + nome, links das páginas e o menu (☰) com acessibilidade e o link do código.
import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import logo from "../../assets/img/ara-logo.webp";
import { useHighContrast } from "../../hooks/useHighContrast.js";
import { useMotion } from "../../hooks/useMotion.jsx";

const LINKS = [
  { to: "/", label: "Início", end: true },
  { to: "/explorar", label: "Explorar" },
  { to: "/analises", label: "Análises" },
  { to: "/sobre", label: "Sobre" },
];
const REPO = "https://github.com/GabsGsm/ARA";

export default function Header() {
  const [open, setOpen] = useState(false);
  const [hc, toggleHc] = useHighContrast();
  const { calm, toggleCalm } = useMotion();
  const navRef = useRef(null);

  // fecha o menu ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (!navRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", onClick); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <header className="topbar">
      <Link className="brand" to="/" aria-label="ARA, página inicial">
        <span className="brand-logo"><img src={logo} alt="" width="720" height="295" /></span>
        <span className="brand-text"><strong>ARA</strong><small>Analog Research &amp; Analysis</small></span>
      </Link>
      <nav className="nav" aria-label="Principal" ref={navRef}>
        <ul id="navLinks" className={open ? "open" : undefined}>
          {LINKS.map((l) => (
            <li key={l.to}><NavLink to={l.to} end={l.end} onClick={() => setOpen(false)}>{l.label}</NavLink></li>
          ))}
          <li className="nav-extra">
            <button className="link-btn" type="button" aria-pressed={hc} onClick={toggleHc}>Alto contraste</button>
            <button className="link-btn" type="button" aria-pressed={calm} onClick={toggleCalm}>
              {calm ? "Retomar animações" : "Pausar animações"}
            </button>
            <a className="link-btn" href={REPO} target="_blank" rel="noopener noreferrer">Código no GitHub ↗</a>
          </li>
        </ul>
        <button className="nav-toggle" type="button" aria-expanded={open} aria-controls="navLinks"
                aria-label={open ? "Fechar menu" : "Abrir menu"} onClick={() => setOpen((v) => !v)}>
          <span /><span /><span />
        </button>
      </nav>
    </header>
  );
}
