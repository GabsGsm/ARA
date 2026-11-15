// Topo: logo + nome, links das páginas e o menu (☰) com acessibilidade e o link do código.
import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import logo from "../../assets/img/ara-logo.webp";
import { useHighContrast } from "../../hooks/useHighContrast.js";
import { useMotion } from "../../hooks/useMotion.jsx";
import { useSettings } from "../../hooks/useSettings.jsx";

// menu principal = o caminho do ARA; o resto fica no ☰ para não poluir
const LINKS = [
  { to: "/", label: ["Início", "Home"], end: true },
  { to: "/explorar", label: ["Explorar", "Explore"] },
  { to: "/3d", label: ["3D", "3D"] },
  { to: "/laboratorio", label: ["Laboratório", "Data lab"] },
  { to: "/missao", label: ["Missão", "Mission"] },
  { to: "/sobre", label: ["Sobre", "About"] },
];
const MORE = [
  { to: "/veiculos", label: ["Veículos (modelos 3D)", "Vehicles (3D models)"] },
  { to: "/campo", label: ["Modo de campo (celular)", "Field mode (phone)"] },
  { to: "/analises", label: ["Análises de robustez", "Robustness analyses"] },
  { to: "/configuracoes", label: ["⚙ Configurações e acessibilidade", "⚙ Settings and accessibility"] },
];
const REPO = "https://github.com/GabsGsm/ARA";

export default function Header() {
  const [open, setOpen] = useState(false);
  const [hc, toggleHc] = useHighContrast();
  const { calm, toggleCalm } = useMotion();
  const { lang, set, tr } = useSettings();
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
      <Link className="brand" to="/" aria-label={tr("ARA, página inicial", "ARA, home page")}>
        <span className="brand-logo"><img src={logo} alt="" width="720" height="295" /></span>
        <span className="brand-text"><strong>ARA</strong><small>Analog Research &amp; Analysis</small></span>
      </Link>
      <nav className="nav" aria-label={tr("Principal", "Main")} ref={navRef}>
        <ul id="navLinks" className={open ? "open" : undefined}>
          {LINKS.map((l) => (
            <li key={l.to}><NavLink to={l.to} end={l.end} onClick={() => setOpen(false)}>{tr(...l.label)}</NavLink></li>
          ))}
          <li className="nav-extra">
            {MORE.map((l) => <NavLink key={l.to} className="link-btn" to={l.to} onClick={() => setOpen(false)}>{tr(...l.label)}</NavLink>)}
            <hr className="nav-sep" />
            <button className="link-btn" type="button" aria-pressed={hc} onClick={toggleHc}>{tr("Alto contraste", "High contrast")}</button>
            <button className="link-btn" type="button" aria-pressed={calm} onClick={toggleCalm}>
              {calm ? tr("Retomar animações", "Resume animations") : tr("Pausar animações", "Pause animations")}
            </button>
            <a className="link-btn" href={REPO} target="_blank" rel="noopener noreferrer">{tr("Código no GitHub ↗", "Code on GitHub ↗")}</a>
          </li>
        </ul>
        <button type="button" className="lang-btn" onClick={() => set("lang", lang === "en" ? "pt" : "en")}
                aria-label={lang === "en" ? "Mudar para português" : "Switch to English"} title={lang === "en" ? "Português" : "English"}>
          {lang === "en" ? "PT" : "EN"}
        </button>
        <button className="nav-toggle" type="button" aria-expanded={open} aria-controls="navLinks"
                aria-label={open ? tr("Fechar menu", "Close menu") : tr("Abrir menu", "Open menu")} onClick={() => setOpen((v) => !v)}>
          <span /><span /><span />
        </button>
      </nav>
    </header>
  );
}
