// Veículos de exploração: modelos 3D em escala real, ficha técnica e a lição de cada um para a missão tripulada.
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import VehicleViewer from "../components/vehicles/VehicleViewer.jsx";
import { VEHICLES, byKey } from "../lib/vehicles.js";
import { useMotion } from "../hooks/useMotion.jsx";
import "../assets/css/vehicles.css";

const BODY = { mars: "Marte", moon: "Lua", both: "Lua e Marte" };

function SizeBar({ current }) {
  const max = 9.4;
  return (
    <div className="vh-sizes" aria-label="Comprimento dos veículos em escala">
      {VEHICLES.filter((v) => v.key !== "astronaut").map((v) => (
        <div key={v.key} className={v.key === current ? "on" : undefined}>
          <span>{v.name}</span>
          <i style={{ width: `${(v.len / max) * 100}%` }} />
          <b>{v.len.toLocaleString("pt-BR")} m</b>
        </div>
      ))}
    </div>
  );
}

export default function Vehicles() {
  const [params, setParams] = useSearchParams();
  const { calm } = useMotion();
  const [key, setKey] = useState(() => (byKey(params.get("v")) ? params.get("v") : "perseverance"));
  const v = byKey(key);
  const pick = (k) => { setKey(k); setParams({ v: k }, { replace: true }); };
  const to3d = v.key === "astronaut" ? `/3d?site=${v.site}&veiculo=astronaut` : `/3d?site=${v.site}&veiculo=${v.key}`;

  return (
    <section aria-labelledby="vhTitle" className="mx-auto max-w-[1500px] px-[clamp(12px,2vw,30px)] pt-6 pb-10">
      <header className="mb-4">
        <p className="eyebrow mb-1">Frota de exploração</p>
        <h1 id="vhTitle" className="vh-title">Quem já andou lá — e o que isso ensina à tripulação</h1>
        <p className="desc m-0 max-w-[880px]">Cada veículo resolveu um problema que uma missão tripulada vai enfrentar de novo: solo que prende, pedras que cortam, frio, comunicação atrasada e consumíveis contados. Veja em escala real e leve para o relevo no laboratório 3D.</p>
      </header>

      <div className="vh-layout">
        <nav className="vh-list" aria-label="Veículos">
          {VEHICLES.map((x) => (
            <button key={x.key} type="button" aria-pressed={x.key === key} onClick={() => pick(x.key)}>
              <b>{x.name}</b>
              <small>{BODY[x.body]}{x.year ? ` · ${x.year}` : ""}</small>
            </button>
          ))}
        </nav>

        <div className="vh-stage card">
          <VehicleViewer vehicle={v} calm={calm} />
          <SizeBar current={key} />
        </div>

        <article className="vh-sheet card" aria-labelledby="vhName">
          <p className="eyebrow mb-1">{v.mission}{v.year ? ` · ${v.year}` : ""}</p>
          <h2 id="vhName" className="vh-name">{v.name}</h2>
          <dl className="vh-specs">
            {v.specs.map(([k, val]) => <div key={k}><dt>{k}</dt><dd>{val}</dd></div>)}
          </dl>
          <h3 className="vh-h">Lição para a missão tripulada</h3>
          <p className="vh-lesson">{v.lesson}</p>
          <h3 className="vh-h">Curiosidades</h3>
          <ul className="vh-facts">{v.facts.map((f) => <li key={f}>{f}</li>)}</ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link className="vh-btn gold" to={to3d}>Ver no relevo 3D, em escala</Link>
            <Link className="vh-btn" to="/explorar">Comparar pressão e temperatura</Link>
          </div>
          <p className="note mt-3">Modelo: {v.model}. Modelos oficiais em <a href="https://science.nasa.gov/3d-resources/" target="_blank" rel="noopener noreferrer">science.nasa.gov/3d-resources ↗</a> (domínio público). Dados: NASA/JPL.</p>
        </article>
      </div>
    </section>
  );
}
