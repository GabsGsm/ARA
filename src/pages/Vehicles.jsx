// Veículos de exploração: modelos 3D em escala real, ficha técnica e a lição de cada um para a missão tripulada.
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import VehicleViewer from "../components/vehicles/VehicleViewer.jsx";
import { VEHICLES, byKey, localize } from "../lib/vehicles.js";
import { useSettings } from "../hooks/useSettings.jsx";
import { useMotion } from "../hooks/useMotion.jsx";
import "../assets/css/vehicles.css";

const BODY = { mars: ["Marte", "Mars"], moon: ["Lua", "Moon"], both: ["Lua e Marte", "Moon and Mars"] };

function SizeBar({ current, lang, tr }) {
  const max = 9.4;
  return (
    <div className="vh-sizes" aria-label={tr("Comprimento dos veículos em escala", "Vehicle lengths to scale")}>
      {VEHICLES.filter((v) => v.key !== "astronaut").map((v) => (
        <div key={v.key} className={v.key === current ? "on" : undefined}>
          <span>{localize(v, lang).name}</span>
          <i style={{ width: `${(v.len / max) * 100}%` }} />
          <b>{v.len.toLocaleString(lang === "en" ? "en-US" : "pt-BR")} m</b>
        </div>
      ))}
    </div>
  );
}

export default function Vehicles() {
  const [params, setParams] = useSearchParams();
  const { calm } = useMotion();
  const { tr, lang } = useSettings();
  const [key, setKey] = useState(() => (byKey(params.get("v")) ? params.get("v") : "perseverance"));
  const v = localize(byKey(key), lang);
  const pick = (k) => { setKey(k); setParams({ v: k }, { replace: true }); };
  const to3d = v.key === "astronaut" ? `/3d?site=${v.site}&veiculo=astronaut` : `/3d?site=${v.site}&veiculo=${v.key}`;

  return (
    <section aria-labelledby="vhTitle" className="mx-auto max-w-[1500px] px-[clamp(12px,2vw,30px)] pt-6 pb-10">
      <header className="mb-4">
        <p className="eyebrow mb-1">{tr("Frota de exploração", "Exploration fleet")}</p>
        <h1 id="vhTitle" className="vh-title">{tr("Quem já andou lá — e o que isso ensina à tripulação", "Who has been there — and what it teaches the crew")}</h1>
        <p className="desc m-0 max-w-[880px]">{tr("Cada veículo resolveu um problema que uma missão tripulada vai enfrentar de novo: solo que prende, pedras que cortam, frio, comunicação atrasada e consumíveis contados. Veja em escala real, leve para o relevo 3D ou dirija na Missão.", "Each vehicle solved a problem a crewed mission will face again: trapping soil, cutting rocks, cold, delayed communication and limited consumables. See it at real scale, take it to the 3D relief or drive it in Mission.")}</p>
      </header>

      <div className="vh-layout">
        <nav className="vh-list" aria-label={tr("Veículos", "Vehicles")}>
          {VEHICLES.map((x) => (
            <button key={x.key} type="button" aria-pressed={x.key === key} onClick={() => pick(x.key)}>
              <b>{localize(x, lang).name}</b>
              <small>{tr(...BODY[x.body])}{x.year ? ` · ${x.year}` : ""}</small>
            </button>
          ))}
        </nav>

        <div className="vh-stage card">
          <VehicleViewer vehicle={v} calm={calm} />
          <SizeBar current={key} lang={lang} tr={tr} />
        </div>

        <article className="vh-sheet card" aria-labelledby="vhName">
          <p className="eyebrow mb-1">{v.mission}{v.year ? ` · ${v.year}` : ""}</p>
          <h2 id="vhName" className="vh-name">{v.name}</h2>
          <dl className="vh-specs">
            {v.specs.map(([k, val]) => <div key={k}><dt>{k}</dt><dd>{val}</dd></div>)}
          </dl>
          <h3 className="vh-h">{tr("Lição para a missão tripulada", "Lesson for the crewed mission")}</h3>
          <p className="vh-lesson">{v.lesson}</p>
          <h3 className="vh-h">{tr("Curiosidades", "Fun facts")}</h3>
          <ul className="vh-facts">{v.facts.map((f) => <li key={f}>{f}</li>)}</ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link className="vh-btn gold" to={to3d}>{tr("Ver no relevo 3D, em escala", "See it on 3D relief, to scale")}</Link>
            {["perseverance", "curiosity", "mer", "lrv"].includes(v.key) && <Link className="vh-btn gold" to={`/missao?rover=${v.key}`}>{tr("Dirigir em missão", "Drive it in a mission")}</Link>}
            <Link className="vh-btn" to={`/explorar?corpo=${v.body === "moon" ? "lua" : "marte"}&aba=ambiente`}>{tr("Comparar pressão e temperatura", "Compare pressure and temperature")}</Link>
          </div>
          <p className="note mt-3">{tr("Modelo", "Model")}: {v.model}. {tr("Modelos oficiais em", "Official models at")} <a href="https://science.nasa.gov/3d-resources/" target="_blank" rel="noopener noreferrer">science.nasa.gov/3d-resources ↗</a> ({tr("domínio público", "public domain")}). {tr("Dados", "Data")}: NASA/JPL.</p>
        </article>
      </div>
    </section>
  );
}
