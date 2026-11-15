// Pressão, temperatura e gravidade: o que o ensaio no análogo da Terra não reproduz e como compensar.
// Missão: Diviner PRP (Lua) e THEMIS (Marte) do próprio recorte; pressão de Marte estimada pela altitude do DEM.
// Análogo: altitude da célula (Terrain Tiles) → pressão barométrica; temperatura da climatologia NASA POWER.
import { useEffect, useState } from "react";
import { elevationAt } from "../../lib/services/earthData.js";
import { dataUrl, fmt } from "../../lib/format.js";
import { T, getLang } from "../../lib/i18n.js";

const MONTHS = () => (getLang() === "en" ? ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] : ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]);
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
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: 820 }} role="img" aria-label={T("Escala de pressão (logarítmica)", "Pressure scale (logarithmic)")}>
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
      ? { main: `${fmt(K(bt.temperature_mean_k), 0)} °C`, sub: T(`THEMIS às ${fmt(Number(bt.local_time_hours), 1)} h locais (temperatura de brilho da superfície); Marte vai de −125 °C a +20 °C, média −63 °C`, `THEMIS at ${fmt(Number(bt.local_time_hours), 1)} h local time (surface brightness temperature); Mars ranges from −125 °C to +20 °C, mean −63 °C`) }
      : { main: T("−63 °C (média do planeta)", "−63 °C (planet mean)"), sub: T("Faixa de −125 °C a +20 °C", "Range −125 °C to +20 °C") };
  } else if (th.temp_mean_annual_k) {
    tMission = { main: `${fmt(K(th.temp_mean_annual_k), 0)} °C ${T("(média anual)", "(annual mean)")}`,
      sub: T(`Diviner: máxima diária média ${fmt(K(th.temp_max_annual_mean_k), 0)} °C; pontos com média de ${fmt(K(th.temp_mean_annual_lowest_k), 0)} °C no recorte`, `Diviner: mean daily maximum ${fmt(K(th.temp_max_annual_mean_k), 0)} °C; some spots average ${fmt(K(th.temp_mean_annual_lowest_k), 0)} °C within the site`) };
  } else {
    tMission = { main: T("−173 a +127 °C", "−173 to +127 °C"), sub: T("Faixa do dia e da noite lunar (Diviner)", "Lunar day–night range (Diviner)") };
  }
  const c = climate?.params;
  const coldest = c?.T2M_MIN?.monthly ? c.T2M_MIN.monthly.reduce((b, v, i, a) => (v < a[b] ? i : b), 0) : null;
  const gR = G[site.body] / G.earth;
  const where = mars ? T("em Marte", "on Mars") : T("na Lua", "on the Moon");

  return (
    <div className="ev-env">
      <p className="desc m-0">
        {T("Os maiores inimigos de quem sai da nave são a pressão e a temperatura — e nenhum deserto da Terra as reproduz. Aqui o ARA mede o tamanho da lacuna entre", "Pressure and temperature are the biggest enemies of anyone stepping outside the spacecraft — and no desert on Earth reproduces them. Here ARA measures the size of the gap between")}{" "}
        <b>{site.name}</b> {T("e", "and")} <b>{cellName}</b> {T("e diz como fechá-la no ensaio.", "and tells you how to close it during the rehearsal.")}
      </p>

      <h4 className="eyebrow mb-1 mt-4">{T("Pressão do ambiente", "Ambient pressure")}</h4>
      <PressureScale items={[
        ...(mars ? [{ label: `${T("Marte", "Mars")} ${fmt(pMission, 1)}`, p: pMission, c: "#ffb066" }] : [{ label: T("Lua ≈ vácuo", "Moon ≈ vacuum"), p: 0.1, c: "#c9d3e0" }]),
        { label: T("limite de Armstrong", "Armstrong limit"), p: ARMSTRONG, c: "#ff6b6b" },
        { label: T("traje 296", "suit 296"), p: SUIT, c: "#59e0ff" },
        ...(pEarth ? [{ label: `${T("análogo", "analog")} ${fmt(pEarth, 0)}`, p: pEarth, c: "#33c780" }] : []),
      ]} />
      <p className="note m-0">{T(`Abaixo de 63 hPa (faixa vermelha) a água do corpo ferve a 37 °C: ${where} o traje pressurizado não é opcional. Escala logarítmica.`, `Below 63 hPa (red band) body fluids boil at 37 °C: ${where} a pressurised suit is not optional. Logarithmic scale.`)}</p>

      <table className="data-table mt-4">
        <thead><tr><th>{T("Fator", "Factor")}</th><th>{T("Missão", "Mission")}</th><th>{T("Análogo", "Analog")}</th><th>{T("Como ensaiar a diferença", "How to rehearse the difference")}</th></tr></thead>
        <tbody>
          <tr>
            <th scope="row">{T("Pressão", "Pressure")}</th>
            <td>{mars ? <><b>≈ {fmt(pMission, 1)} hPa</b><small className="block text-muted">{T("estimada pela altitude do relevo", "estimated from terrain altitude")} ({Number.isFinite(siteH) ? `${fmt(siteH, 0)} m` : "…"}); {T("varia ~25% com as estações", "varies ~25% with the seasons")}</small></> : <><b>{T("vácuo", "vacuum")}</b><small className="block text-muted">{T("exosfera, ~10⁻¹⁵ da pressão da Terra", "exosphere, ~10⁻¹⁵ of Earth's pressure")}</small></>}</td>
            <td>{pEarth ? <><b>{fmt(pEarth, 0)} hPa</b><small className="block text-muted">{T(`a ${fmt(elev, 0)} m de altitude`, `at ${fmt(elev, 0)} m altitude`)}{mars ? ` — ${fmt(pEarth / pMission, 0)}× ${T("a de Marte", "that of Mars")}` : ""}</small></> : elev === null ? "…" : T("altitude indisponível", "altitude unavailable")}</td>
            <td>{T("Ensaiar de traje pressurizado (296 hPa, O₂ puro): são as luvas infladas que tiram destreza e cansam as mãos, e o análogo a céu aberto não mostra isso. O traje a 296 hPa exige pré-respiração de O₂ antes de cada saída — reserve esse tempo na jornada.", "Rehearse in a pressurised suit (296 hPa, pure O₂): inflated gloves are what cost dexterity and tire the hands, and an open-air analog does not show that. A 296 hPa suit requires O₂ pre-breathing before each EVA — budget that time into the workday.")}</td>
          </tr>
          <tr>
            <th scope="row">{T("Temperatura", "Temperature")}</th>
            <td><b>{tMission.main}</b><small className="block text-muted">{tMission.sub}</small></td>
            <td>{c?.T2M ? <><b>{fmt(c.T2M.annual, 0)} °C {T("(média anual)", "(annual mean)")}</b><small className="block text-muted">{T("mínima média", "mean minimum")} {fmt(c.T2M_MIN.annual, 0)} °C · {T("máxima média", "mean maximum")} {fmt(c.T2M_MAX.annual, 0)} °C (NASA POWER, {climate.period ?? T("climatologia", "climatology")})</small></> : T("climatologia indisponível para esta célula", "no climatology for this cell")}</td>
            <td>{mars
              ? T("O CO₂ rarefeito tira pouco calor por convecção, mas o chão gelado tira por contato: botas, luvas e rodas sentem o frio primeiro. Baterias e lubrificantes perdem desempenho — teste-os em câmara fria.", "The thin CO₂ removes little heat by convection, but the frozen ground removes it by contact: boots, gloves and wheels feel the cold first. Batteries and lubricants lose performance — test them in a cold chamber.")
              : T("Sem ar não há convecção: o lado ao Sol esquenta e o lado na sombra esfria ao mesmo tempo, e o calor só sai por radiação. Ferramentas que tocam o solo na sombra precisam de ensaio em câmara térmica a vácuo.", "Without air there is no convection: the sunlit side heats while the shaded side cools at the same time, and heat leaves only by radiation. Tools that touch shaded ground need thermal-vacuum chamber testing.")}
              {coldest != null && <> {T("Para chegar mais perto do frio da missão, ensaie em", "To get closer to the mission's cold, rehearse in")} <b>{MONTHS()[coldest]}</b> ({T("mínima média de", "mean minimum of")} {fmt(c.T2M_MIN.monthly[coldest], 0)} °C {T("no análogo", "at the analog")}).</>}
            </td>
          </tr>
          <tr>
            <th scope="row">{T("Gravidade", "Gravity")}</th>
            <td><b>{fmt(G[site.body], 2)} m/s²</b><small className="block text-muted">{fmt(gR * 100, 0)}% {T("da Terra", "of Earth's")}</small></td>
            <td><b>{fmt(9.81, 2)} m/s²</b></td>
            <td>{T(`Uma carga de 100 kg pesa ${fmt(100 * gR, 0)} kgf ${where} e 100 kgf aqui: use suspensão parcial do peso (como o ARGOS do JSC) ou reduza a carga — a Travessia gêmea no 3D calcula quanto.`, `A 100 kg load weighs ${fmt(100 * gR, 0)} kgf ${where} and 100 kgf here: use partial weight offload (like JSC's ARGOS) or lighten the load — the 3D Twin traverse calculates by how much.`)}</td>
          </tr>
        </tbody>
      </table>
      <p className="note mt-2">{T("Missão", "Mission")}: {mars ? T("pressão = 6,1 hPa × e^(−h / 11,1 km), com h do DEM do recorte; temperatura de brilho THEMIS (observação única)", "pressure = 6.1 hPa × e^(−h / 11.1 km), with h from the site DEM; THEMIS brightness temperature (single observation)") : T("temperaturas modeladas Diviner PRP no recorte", "Diviner PRP modelled temperatures for the site")}. {T("Análogo: altitude no centro da célula (AWS Terrain Tiles) com atmosfera padrão; clima NASA POWER num pixel de ~0,5°. Contexto para planejar o ensaio — não substitui medição no local.", "Analog: altitude at the cell centre (AWS Terrain Tiles) with a standard atmosphere; NASA POWER climate on a ~0.5° pixel. Context for planning the rehearsal — not a substitute for on-site measurement.")}</p>
    </div>
  );
}
