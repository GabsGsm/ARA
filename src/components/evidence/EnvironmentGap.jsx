// Pressão, temperatura e gravidade: o que o ensaio no análogo da Terra não reproduz e como compensar.
// Missão: Diviner PRP (Lua) e THEMIS (Marte) do próprio recorte; pressão de Marte estimada pela altitude do DEM.
// Análogo: altitude da célula (Terrain Tiles) → pressão barométrica; temperatura da climatologia NASA POWER.
import { useEffect, useState } from "react";
import { elevationAt } from "../../lib/services/earthData.js";
import { dataUrl, fmt } from "../../lib/format.js";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const K = (k) => k - 273.15;
const G = { mars: 3.721, moon: 1.62, earth: 9.807 };
const ARMSTRONG = 63;     // hPa — abaixo disso a água do corpo ferve a 37 °C
const SUIT = 296;         // hPa — 4,3 psi, pressão de operação dos trajes de EVA da NASA (O₂ puro)
const MARS_P0 = 6.1;      // hPa no nível de referência (areoide)
const MARS_H = 11100;     // m — altura de escala da atmosfera de Marte

const earthHpa = (h) => 1013.25 * (1 - 2.25577e-5 * h) ** 5.25588;

function PressureScale({ items }) {
  const W = 760, H = 74, P = 46, lo = -1, hi = Math.log10(1100);
  const x = (p) => P + ((Math.log10(Math.max(p, 0.1)) - lo) / (hi - lo)) * (W - 2 * P);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: 820 }} role="img" aria-label="Escala de pressão (logarítmica)">
      <rect x={P} y="30" width={W - 2 * P} height="6" rx="3" fill="rgba(255,255,255,.12)" />
      <rect x={P} y="30" width={x(ARMSTRONG) - P} height="6" rx="3" fill="rgba(191,38,46,.55)" />
      {[0.1, 1, 10, 100, 1000].map((p) => <text key={p} x={x(p)} y={H - 2} fontSize="9" textAnchor="middle" fill="#7f938f">{p >= 1 ? fmt(p, 0) : "0,1"} hPa</text>)}
      {items.map((it, i) => (
        <g key={it.label}>
          <line x1={x(it.p)} x2={x(it.p)} y1={i % 2 ? 36 : 22} y2={i % 2 ? 50 : 30} stroke={it.c} strokeWidth="2" />
          <circle cx={x(it.p)} cy="33" r="4" fill={it.c} />
          <text x={x(it.p)} y={i % 2 ? 60 : 16} fontSize="10" textAnchor="middle" fill={it.c}>{it.label}</text>
        </g>
      ))}
    </svg>
  );
}

export default function EnvironmentGap({ site, siteAttrs, cell, climate, cellName }) {
  const [elev, setElev] = useState(null);       // altitude da célula da Terra
  const [siteH, setSiteH] = useState(null);     // altitude média do recorte da missão (DEM do laboratório 3D)

  useEffect(() => {
    let alive = true;
    setElev(null);
    elevationAt(cell.lat, cell.lon).then((r) => alive && setElev(r.ok ? r.data.elevation_m : NaN));
    return () => { alive = false; };
  }, [cell.lat, cell.lon]);
  useEffect(() => {
    let alive = true;
    setSiteH(null);
    fetch(dataUrl(`data/terrain/${site.id}.json`)).then((r) => (r.ok ? r.json() : null))
      .then((m) => alive && setSiteH(m?.height ? (m.height.min + m.height.max) / 2 : NaN)).catch(() => alive && setSiteH(NaN));
    return () => { alive = false; };
  }, [site.id]);

  const mars = site.body === "mars";
  const pMission = mars ? (Number.isFinite(siteH) ? MARS_P0 * Math.exp(-siteH / MARS_H) : MARS_P0) : 0;
  const pEarth = Number.isFinite(elev) ? earthHpa(Math.max(elev, -430)) : null;

  // temperatura da missão
  const th = siteAttrs?.thermal ?? {};
  const bt = th.brightness_temperature;
  let tMission;
  if (mars) {
    tMission = bt?.temperature_mean_k
      ? { main: `${fmt(K(bt.temperature_mean_k), 0)} °C`, sub: `THEMIS às ${fmt(Number(bt.local_time_hours), 1)} h locais (temperatura de brilho da superfície); Marte vai de −125 °C a +20 °C, média −63 °C` }
      : { main: "−63 °C (média do planeta)", sub: "Faixa de −125 °C a +20 °C" };
  } else if (th.temp_mean_annual_k) {
    tMission = { main: `${fmt(K(th.temp_mean_annual_k), 0)} °C (média anual)`,
      sub: `Diviner: máxima diária média ${fmt(K(th.temp_max_annual_mean_k), 0)} °C; pontos com média de ${fmt(K(th.temp_mean_annual_lowest_k), 0)} °C no recorte` };
  } else {
    tMission = { main: "−173 a +127 °C", sub: "Faixa do dia e da noite lunar (Diviner)" };
  }
  const c = climate?.params;
  const coldest = c?.T2M_MIN?.monthly ? c.T2M_MIN.monthly.reduce((b, v, i, a) => (v < a[b] ? i : b), 0) : null;
  const gR = G[site.body] / G.earth;

  return (
    <div className="ev-env">
      <p className="desc m-0">
        Os maiores inimigos de quem sai da nave são a <b>pressão</b> e a <b>temperatura</b> — e nenhum deserto da Terra as reproduz.
        Aqui o ARA mede o tamanho da lacuna entre <b>{site.name}</b> e <b>{cellName}</b> e diz como fechá-la no ensaio.
      </p>

      <h4 className="eyebrow mb-1 mt-4">Pressão do ambiente</h4>
      <PressureScale items={[
        ...(mars ? [{ label: `Marte ${fmt(pMission, 1)}`, p: pMission, c: "#ffb066" }] : [{ label: "Lua ≈ vácuo", p: 0.1, c: "#c9d3e0" }]),
        { label: "limite de Armstrong", p: ARMSTRONG, c: "#ff6b6b" },
        { label: "traje 296", p: SUIT, c: "#59e0ff" },
        ...(pEarth ? [{ label: `análogo ${fmt(pEarth, 0)}`, p: pEarth, c: "#33c780" }] : []),
      ]} />
      <p className="note m-0">Abaixo de 63 hPa (faixa vermelha) a água do corpo ferve a 37 °C: {mars ? "em Marte" : "na Lua"} o traje pressurizado não é opcional. Escala logarítmica.</p>

      <table className="data-table mt-4">
        <thead><tr><th>Fator</th><th>Missão</th><th>Análogo</th><th>Como ensaiar a diferença</th></tr></thead>
        <tbody>
          <tr>
            <th scope="row">Pressão</th>
            <td>{mars ? <><b>≈ {fmt(pMission, 1)} hPa</b><small className="block text-muted">estimada pela altitude do relevo ({Number.isFinite(siteH) ? `${fmt(siteH, 0)} m` : "…"}); varia ~25% com as estações</small></> : <><b>vácuo</b><small className="block text-muted">exosfera, ~10⁻¹⁵ da pressão da Terra</small></>}</td>
            <td>{pEarth ? <><b>{fmt(pEarth, 0)} hPa</b><small className="block text-muted">a {fmt(elev, 0)} m de altitude{mars ? ` — ${fmt(pEarth / pMission, 0)}× a de Marte` : ""}</small></> : elev === null ? "…" : "altitude indisponível"}</td>
            <td>Ensaiar <b>de traje pressurizado</b> (296 hPa, O₂ puro): as luvas infladas é que tiram destreza e cansam as mãos, e isso o análogo a céu aberto não mostra. O traje a 296 hPa exige pré-respiração de O₂ antes de cada saída — planeje esse tempo na jornada.</td>
          </tr>
          <tr>
            <th scope="row">Temperatura</th>
            <td><b>{tMission.main}</b><small className="block text-muted">{tMission.sub}</small></td>
            <td>{c?.T2M ? <><b>{fmt(c.T2M.annual, 0)} °C (média anual)</b><small className="block text-muted">mínima média {fmt(c.T2M_MIN.annual, 0)} °C · máxima média {fmt(c.T2M_MAX.annual, 0)} °C (NASA POWER, {climate.period ?? "climatologia"})</small></> : "climatologia indisponível para esta célula"}</td>
            <td>{mars
              ? <>O CO₂ rarefeito tira pouco calor por convecção, mas o chão gelado tira por contato: botas, luvas e rodas sentem o frio primeiro. Baterias e lubrificantes perdem desempenho — teste-os em câmara fria.</>
              : <>Sem ar não há convecção: o lado ao Sol esquenta e o lado na sombra esfria ao mesmo tempo, e o calor só sai por radiação. Ferramentas que tocam o solo na sombra precisam de ensaio em câmara térmica a vácuo.</>}
              {coldest != null && <> Para chegar mais perto do frio da missão, ensaie em <b>{MONTHS[coldest]}</b> (mínima média de {fmt(c.T2M_MIN.monthly[coldest], 0)} °C no análogo).</>}
            </td>
          </tr>
          <tr>
            <th scope="row">Gravidade</th>
            <td><b>{fmt(G[site.body], 2)} m/s²</b><small className="block text-muted">{fmt(gR * 100, 0)}% da Terra</small></td>
            <td><b>9,81 m/s²</b></td>
            <td>Uma carga de 100 kg pesa {fmt(100 * gR, 0)} kgf {mars ? "em Marte" : "na Lua"} e 100 kgf aqui: use suspensão parcial do peso (como o ARGOS do JSC) ou reduza a carga — a <b>Travessia gêmea</b> no 3D calcula quanto.</td>
          </tr>
        </tbody>
      </table>
      <p className="note mt-2">Missão: {mars ? "pressão = 6,1 hPa × e^(−h / 11,1 km), com h do DEM do recorte; temperatura de brilho THEMIS (observação única)" : "temperaturas modeladas Diviner PRP no recorte"}. Análogo: altitude no centro da célula (AWS Terrain Tiles) com atmosfera padrão; clima NASA POWER num pixel de ~0,5°. Contexto para planejar o ensaio — não substitui medição no local.</p>
    </div>
  );
}
