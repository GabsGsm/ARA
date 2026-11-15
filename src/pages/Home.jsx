// Página inicial "Explore beyond Earth" — palco no mesmo sistema de coordenadas da arte de referência
// (1600 × 900; a caixa vai de x 450→1530 e y 140→730). Tudo dentro do .stage escala junto (home.css).
import { Link } from "react-router-dom";
import FeatureList from "../components/home/FeatureList.jsx";
import GlobeCanvas from "../components/home/GlobeCanvas.jsx";
import marsTex from "../assets/img/mars-tex.jpg";
import moonTex from "../assets/img/moon-tex.jpg";
import horizon from "../assets/img/horizon.webp";
import { useTr } from "../hooks/useSettings.jsx";

const at = (x, y, w) => ({ "--x": x, "--y": y, "--w": w });

function Orbits() {
  return (
    <svg className="orbit back" viewBox="450 140 1080 590" aria-hidden="true">
      <defs>
        <linearGradient id="orbBack" gradientUnits="userSpaceOnUse" x1="440" y1="0" x2="1570" y2="0">
          <stop offset="0" stopColor="#f2b53a" stopOpacity=".9" /><stop offset=".4" stopColor="#f2b53a" stopOpacity=".55" /><stop offset="1" stopColor="#ffd166" />
        </linearGradient>
      </defs>
      <ellipse cx="1001" cy="384" rx="563" ry="148" transform="rotate(-16.6 1001 384)" fill="none" stroke="url(#orbBack)" strokeWidth="2" />
      {/* arcos finos em volta de Marte */}
      <path d="M555.9 438.1 A242 242 0 0 1 788.6 175.1" className="arc faint" />
      <path d="M801.2 175 A242 242 0 0 1 899.3 197.7" className="arc gold" />
      <path d="M1029.1 332.5 A247 247 0 0 1 1020.9 521.4" className="arc faint dash" />
      {/* arcos finos em volta da Lua */}
      <path d="M1095.5 272.5 A202 202 0 0 1 1221 223.1" className="arc white" />
      <path d="M1179.1 621 A202 202 0 0 1 1087.7 570.3" className="arc gold" />
      <path d="M1414.7 337.9 A206 206 0 0 1 1385.8 557.4" className="arc faint dash" />
    </svg>
  );
}

function FrontOrbit() {
  return (
    <svg className="orbit front" viewBox="450 140 1080 590" aria-hidden="true">
      <defs>
        <linearGradient id="orbFront" gradientUnits="userSpaceOnUse" x1="440" y1="0" x2="1570" y2="0">
          <stop offset="0" stopColor="#f7c75a" /><stop offset=".45" stopColor="#ffd77a" /><stop offset="1" stopColor="#ffe3a0" />
        </linearGradient>
        <radialGradient id="glowDot">
          <stop offset="0" stopColor="#fffaf0" /><stop offset=".3" stopColor="#ffd166" stopOpacity=".85" /><stop offset="1" stopColor="#f2b53a" stopOpacity="0" />
        </radialGradient>
        <path id="orbPath" d="M438 384 A563 148 0 1 0 1564 384 A563 148 0 1 0 438 384" transform="rotate(-16.6 1001 384)" />
        {/* esconde o cometa quando ele passa por trás de Marte (metade de cima do disco) */}
        <mask id="behindMars" maskUnits="userSpaceOnUse" x="400" y="100" width="1200" height="700">
          <rect x="400" y="100" width="1200" height="700" fill="#fff" />
          <path d="M582 417 A215 215 0 0 1 1012 417 L1012 470 L582 500 Z" fill="#000" />
        </mask>
      </defs>
      <path d="M438 384 A563 148 0 0 0 1564 384" transform="rotate(-16.6 1001 384)" fill="none" stroke="url(#orbFront)" strokeWidth="2.2" />
      <circle className="cross" cx="980" cy="542" r="20" fill="url(#glowDot)" />
      <g mask="url(#behindMars)">
        <circle r="14" fill="url(#glowDot)"><animateMotion dur="22s" repeatCount="indefinite"><mpath href="#orbPath" /></animateMotion></circle>
      </g>
    </svg>
  );
}

function Sparkles() {
  return (
    <svg className="sparkles" viewBox="450 140 1080 590" aria-hidden="true">
      <defs><path id="spark" d="M0 -24 C2.2 -5 5 -2.2 24 0 C5 2.2 2.2 5 0 24 C-2.2 5 -5 2.2 -24 0 C-5 -2.2 -2.2 -5 0 -24Z" /></defs>
      <g transform="translate(1408 202)"><use href="#spark" className="tw" style={{ "--s": 1.05, "--t": "4s" }} /></g>
      <g transform="translate(527 605)"><use href="#spark" className="tw" style={{ "--s": 0.78, "--t": "3.4s", "--d": "1.2s" }} /></g>
    </svg>
  );
}

export default function Home() {
  const tr = useTr();
  return (
    <section className="home" aria-labelledby="heroTitle">
      <div className="hero">
        <span className="corner tl" aria-hidden="true" /><span className="corner tr" aria-hidden="true" />
        <span className="corner bl" aria-hidden="true" /><span className="corner br" aria-hidden="true" />

        <div className="hero-copy">
          <h1 id="heroTitle" className="display hero-title">
            <span className="line" style={{ "--d": ".1s" }}>Explore</span>
            <span className="line" style={{ "--d": ".22s" }}>beyond</span>
            <span className="line gold-text" style={{ "--d": ".34s" }}>Earth.</span>
          </h1>
          <span className="rule" aria-hidden="true" />
          <p className="lead reveal" style={{ "--d": ".55s" }}>{tr("Encontre na Terra ambientes", "Find places on Earth")}<br />{tr("semelhantes aos de Marte e da Lua.", "that resemble Mars and the Moon.")}</p>
          <FeatureList />
        </div>

        <div className="stage">
          <Orbits />
          <Link className="planet-card mars" to="/explorar?corpo=marte" aria-label={tr("Explorar Marte", "Explore Mars")}>
            <span className="planet" style={at(582, 202, 430)}>
              <span className="atmo" aria-hidden="true" />
              <GlobeCanvas texture={marsTex} light="-0.6,-0.55" period={80} dark={0.8} />
              <span className="flare" aria-hidden="true" />
            </span>
            <span className="pill gold glow" style={at(608, 664, 335)}>
              <svg viewBox="0 0 46 30" aria-hidden="true">
                <path d="M2 27 L16 6 L24 17 L30 10 L44 27 Z" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
                <path d="M9 20 l7-8 5 6" fill="none" stroke="currentColor" strokeWidth="2.2" />
              </svg>
              {tr("Marte", "Mars")}<i aria-hidden="true">⟶</i>
            </span>
          </Link>
          <Link className="planet-card moon" to="/explorar?corpo=lua" aria-label={tr("Explorar a Lua", "Explore the Moon")}>
            <span className="planet" style={at(1051, 248, 354)}>
              <span className="atmo" aria-hidden="true" />
              <GlobeCanvas texture={moonTex} light="0.55,-0.45" period={100} dark={0.5} />
            </span>
            <span className="pill" style={at(1055, 664, 320)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 2.5 a9.5 9.5 0 1 0 7 15.5 a7.5 7.5 0 1 1 -7 -15.5z" fill="currentColor" /></svg>
              {tr("Lua", "Moon")}<i aria-hidden="true">⟶</i>
            </span>
          </Link>
          <FrontOrbit />
          <Sparkles />
        </div>
      </div>
      <img className="horizon" src={horizon} alt="" aria-hidden="true" />
    </section>
  );
}
