// Topo: logo + nome, links das páginas e o menu (☰) com acessibilidade e o link do código.
import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import logo from "../../assets/img/ara-logo.webp";
import { useHighContrast } from "../../hooks/useHighContrast.js";
import { useMotion } from "../../hooks/useMotion.jsx";

// menu principal = o caminho do ARA; o resto fica no ☰ para não poluir
const LINKS = [
  { to: "/", label: "Início", end: true },
  { to: "/explorar", label: "Explorar" },
  { to: "/3d", label: "3D" },
  { to: "/laboratorio", label: "Laboratório" },
  { to: "/missao", label: "Missão" },
  { to: "/sobre", label: "Sobre" },
];
const MORE = [
  { to: "/veiculos", label: "Veículos (modelos 3D)" },
  { to: "/campo", label: "Modo de campo (celular)" },
  { to: "/analises", label: "Análises de robustez" },
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
            {MORE.map((l) => <NavLink key={l.to} className="link-btn" to={l.to} onClick={() => setOpen(false)}>{l.label}</NavLink>)}
            <hr className="nav-sep" />
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
