// Mineral Explorer — evidência geológica/mineral em dois níveis, sem misturar categorias:
//   Marte: unidades minerais CRISM + CaSSIS (observado) e inércia térmica THEMIS 2026 (derivado) em Jezero
//   Terra: unidades geológicas mapeadas (Macrostrat, contexto) — litologia não é identificação mineral
//   Lua:   evidências por alvo (Diviner, M3, iluminação), separando unidade, material, assinatura e voláteis
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { ImageOverlay, MapContainer, Rectangle, TileLayer, Tooltip, useMapEvents } from "react-leaflet";
import Segmented from "../ui/Segmented.jsx";
import { useAraData } from "../../hooks/useAraData.jsx";
import { dataUrl, fmt } from "../../lib/format.js";
import * as svc from "../../lib/services/earthData.js";

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const MACRO = "https://tiles.macrostrat.org/carto/{z}/{x}/{y}.png";
const BODIES = [{ value: "mars", label: "Marte · Jezero" }, { value: "earth", label: "Terra · geologia" }, { value: "moon", label: "Lua · alvos Artemis" }];

function Clicks({ onClick }) { useMapEvents({ click: (e) => onClick(e.latlng) }); return null; }

/* ---------------------------------------------------------------- Marte */
function MarsMinerals() {
  const data = useAraData();
  const [j, setJ] = useState(null);
  const [err, setErr] = useState(null);
  const [on, setOn] = useState({});
  const [layer, setLayer] = useState("minerais");      // minerais | termico | limite
  const [opacity, setOpacity] = useState(0.85);
  const [probe, setProbe] = useState(null);
  const canvas = useRef(null);
  const trek = data.config.planet_maps?.mars;

  useEffect(() => {
    fetch(dataUrl("data/minerals/jezero.json")).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((d) => { setJ(d); setOn(Object.fromEntries(d.crism.classes.map((c) => [c.value, true]))); })
      .catch(() => setErr("Camadas de Marte não encontradas — rode python pipeline/build_minerals.py"));
  }, []);
  // imagem das classes num canvas, para saber a classe do ponto clicado
  useEffect(() => {
    if (!j) return;
    const img = new Image();
    img.onload = () => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; c.getContext("2d").drawImage(img, 0, 0); canvas.current = c; };
    img.src = dataUrl(`data/minerals/${j.crism.file}`);
  }, [j]);

  const onClick = ({ lat, lng }) => {
    if (!j) return;
    const out = { lat, lon: lng };
    const [[s, w], [n, e]] = j.crism.bounds;
    if (canvas.current && lat >= s && lat <= n && lng >= w && lng <= e) {
      const x = Math.floor(((lng - w) / (e - w)) * canvas.current.width), y = Math.floor(((n - lat) / (n - s)) * canvas.current.height);
      const [r, g, b, a] = canvas.current.getContext("2d").getImageData(x, y, 1, 1).data;
      out.mineral = a > 0 ? j.crism.classes.find((c) => c.color[0] === r && c.color[1] === g && c.color[2] === b) ?? null : null;
      out.inCrism = true;
    }
    const t = j.themis, [[ts, tw], [tn, te]] = t.bounds;
    if (lat >= ts && lat <= tn && lng >= tw && lng <= te) {
      const r = Math.min(t.grid.rows - 1, Math.floor(((tn - lat) / (tn - ts)) * t.grid.rows)), c = Math.min(t.grid.cols - 1, Math.floor(((lng - tw) / (te - tw)) * t.grid.cols));
      out.ti = t.grid.ti[r][c]; out.ul = t.grid.ul[r][c]; out.inThemis = true;
    }
    setProbe(out);
  };

  if (err) return <p className="dv-warn">{err}</p>;
  if (!j) return <p className="note">Carregando camadas de Marte…</p>;
  const c = j.crism, t = j.themis;
  const center = [18.42, 77.45];
  const sel = probe?.mineral;
  const hmax = Math.max(...t.hist);

  return (
    <div className="mx-grid">
      <aside className="card mx-left" aria-label="Camadas científicas">
        <h3 className="eyebrow">Camadas científicas</h3>
        <Segmented label="Camada" options={[{ value: "minerais", label: "Minerais" }, { value: "termico", label: "Inércia térmica" }, { value: "limite", label: "Qualidade" }]}
                   value={layer} onChange={setLayer} />
        <label className="t3-range"><span>Opacidade <b>{Math.round(opacity * 100)}%</b></span>
          <input type="range" min="0.1" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(+e.target.value)} /></label>
        {layer === "minerais" && (
          <>
            <h3 className="eyebrow mt-4">Materiais observados</h3>
            <ul className="mx-legend">
              {c.classes.map((k) => (
                <li key={k.value}>
                  <label><input type="checkbox" checked={!!on[k.value]} onChange={(e) => setOn((o) => ({ ...o, [k.value]: e.target.checked }))} />
                    <span className="mx-sw" style={{ background: `rgb(${k.color.join(",")})` }} />{k.name}</label>
                  <small>{fmt(k.area_km2, 1)} km² · {k.spectral}</small>
                </li>
              ))}
            </ul>
            <p className="note">Total mapeado: {fmt(c.mapped_area_km2, 1)} km² na borda oeste, a {c.resolution_m} m.</p>
          </>
        )}
        {layer !== "minerais" && (
          <>
            <h3 className="eyebrow mt-4">{layer === "termico" ? "Inércia térmica" : "Limites superiores"}</h3>
            {layer === "termico" ? (
              <>
                <div className="mx-ramp" style={{ background: `linear-gradient(90deg, ${t.colors.map((x) => `rgb(${x.join(",")})`).join(",")})` }} />
                <div className="flex justify-between text-[11px] text-muted"><span>{fmt(t.range[0], 0)}</span><span>{t.unit}</span><span>{fmt(t.range[1], 0)}</span></div>
              </>
            ) : <p className="note">Vermelho mais forte = mais células de 100 m onde só há limite superior (valor menos confiável).</p>}
            <svg viewBox="0 0 160 60" className="mt-2 w-full" role="img" aria-label="Histograma da inércia térmica na área">
              {t.hist.map((h, i) => <rect key={i} x={i * 10 + 1} y={58 - (h / hmax) * 54} width="8" height={(h / hmax) * 54} fill="#59a8e0" />)}
            </svg>
            <p className="note">Histograma de {t.grid.rows * t.grid.cols} células de 1 km ({fmt(t.valid_pct, 0)}% com dado).</p>
          </>
        )}
      </aside>

      <section className="card mx-map" aria-label="Mapa de Jezero">
        <div className="mx-mapbox">
          <MapContainer crs={L.CRS.EPSG4326} center={center} zoom={9} minZoom={6} maxZoom={14} style={{ height: "100%" }} attributionControl={false}>
            {trek && <TileLayer url={trek.url} maxNativeZoom={trek.max_native_zoom} maxZoom={14} noWrap />}
            {layer === "minerais" && c.classes.filter((k) => on[k.value]).map((k) => (
              <ImageOverlay key={k.value} url={dataUrl(`data/minerals/${k.file}`)} bounds={c.bounds} opacity={opacity} className="mx-pixel" />
            ))}
            {layer === "termico" && <ImageOverlay url={dataUrl(`data/minerals/${t.file}`)} bounds={t.bounds} opacity={opacity} className="mx-pixel" />}
            {layer === "limite" && <ImageOverlay url={dataUrl(`data/minerals/${t.upper_limit_file}`)} bounds={t.bounds} opacity={opacity} className="mx-pixel" />}
            {j.sectors.map((s) => (
              <Rectangle key={s.id} bounds={[[s.bbox[1], s.bbox[0]], [s.bbox[3], s.bbox[2]]]} pathOptions={{ color: "#f2b53a", weight: 1.5, fillOpacity: 0 }}>
                <Tooltip permanent direction="top" className="mx-tip">{s.name}</Tooltip>
              </Rectangle>
            ))}
            <Clicks onClick={onClick} />
          </MapContainer>
        </div>
        <p className="note mt-2">Base: {trek?.attribution}. Clique no mapa para consultar o ponto.</p>
      </section>

      <aside className="card mx-right" aria-label="Mineral Passport">
        <h3 className="eyebrow">Mineral Passport</h3>
        {!probe && <p className="note">Clique no mapa para ver o que se sabe sobre o ponto.</p>}
        {probe && (
          <dl className="mx-pass">
            <div><dt>Local</dt><dd>{fmt(probe.lat, 4)}°N, {fmt(probe.lon, 4)}°L (Marte)</dd></div>
            <div><dt>Material ou unidade</dt><dd>{probe.inCrism ? (sel ? <><span className="mx-sw" style={{ background: `rgb(${sel.color.join(",")})` }} />{sel.name}</> : "Dentro da área do mapa, sem classe atribuída") : "Fora do mapa mineral — informação indisponível"}</dd></div>
            {sel && <div><dt>Natureza da evidência</dt><dd>Mineral detectado por sensoriamento remoto (absorvedor dominante: {sel.spectral})</dd></div>}
            {probe.inCrism && <div><dt>Instrumento</dt><dd>{c.source.instrument}</dd></div>}
            {probe.inCrism && <div><dt>Resolução · método</dt><dd>{c.resolution_m} m · {c.source.method}</dd></div>}
            <div><dt>Inércia térmica</dt><dd>{probe.inThemis ? (probe.ti == null ? "Sem valor (só limites superiores)" : `${fmt(probe.ti, 0)} ${t.unit}`) : "Fora do recorte"}{probe.ul != null ? ` · ${probe.ul}% de limites superiores` : ""}</dd></div>
            <div><dt>Qualidade e limites</dt><dd><ul>{[...(probe.inCrism ? c.caveats : []), ...t.caveats.slice(0, 3)].map((x) => <li key={x}>{x}</li>)}</ul></dd></div>
            <div><dt>Fontes</dt><dd><a href={`https://doi.org/${c.source.doi}`} target="_blank" rel="noopener noreferrer">{c.source.authors} — {c.source.name}</a><br />
              <a href={`https://doi.org/${t.source.doi}`} target="_blank" rel="noopener noreferrer">{t.source.authors} — THEMIS 1 km (MC-13)</a></dd></div>
          </dl>
        )}
        <h3 className="eyebrow mt-4">Thermal Fingerprint por setor</h3>
        <table className="data-table m-0">
          <thead><tr><th>Setor</th><th>Mediana</th><th>p10–p90</th><th>Lim. sup.</th></tr></thead>
          <tbody>
            {j.sectors.map((s) => { const v = t.sectors[s.id]; return (
              <tr key={s.id}><th scope="row">{s.name}</th><td>{v.median == null ? "—" : fmt(v.median, 0)}</td><td>{v.p10 == null ? "—" : `${fmt(v.p10, 0)}–${fmt(v.p90, 0)}`}</td><td>{v.upper_limit_pct_mean == null ? "—" : `${fmt(v.upper_limit_pct_mean, 0)}%`}</td></tr>
            ); })}
          </tbody>
        </table>
        <p className="note">Em {t.unit}. Inércia térmica alta = superfície com mais rocha/consolidada; baixa = poeira e grãos finos — relação indireta, não medida de granulometria. Sem equivalente terrestre harmonizado: não entra na comparação com a Terra.</p>
      </aside>
    </div>
  );
}

/* ---------------------------------------------------------------- Terra */
function EarthGeology() {
  const [geo, setGeo] = useState(null);
  const [pt, setPt] = useState(null);
  const [opacity, setOpacity] = useState(0.65);
  const onClick = async ({ lat, lng }) => {
    const lon = ((lng + 540) % 360) - 180;
    setPt({ lat, lon }); setGeo({ loading: true });
    setGeo(await svc.geology(lat, lon));
  };
  const u = geo?.ok ? geo.data?.best : null;
  return (
    <div className="mx-grid">
      <aside className="card mx-left">
        <h3 className="eyebrow">Camadas científicas</h3>
        <p className="m-0 text-[13px] text-ink-2">Geologia mapeada (Macrostrat, integra mapas geológicos de várias escalas) sobre imagem de satélite.</p>
        <label className="t3-range"><span>Opacidade da geologia <b>{Math.round(opacity * 100)}%</b></span>
          <input type="range" min="0" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(+e.target.value)} /></label>
        <h3 className="eyebrow mt-4">Mineralogia observada</h3>
        <p className="note m-0">Mapas minerais por espectroscopia da Terra (NASA EMIT) ainda não estão integrados: exigem login no NASA Earthdata para baixar. Até lá, o ARA mostra só litologia mapeada — que <b>não</b> é identificação mineral.</p>
      </aside>
      <section className="card mx-map">
        <div className="mx-mapbox">
          <MapContainer center={[30, -40]} zoom={3} worldCopyJump style={{ height: "100%" }}>
            <TileLayer url={ESRI} maxZoom={18} attribution="Imagens © Esri" />
            <TileLayer url={MACRO} opacity={opacity} maxZoom={14} attribution="Geologia © Macrostrat (CC BY 4.0)" />
            <Clicks onClick={onClick} />
          </MapContainer>
        </div>
        <p className="note mt-2">Clique para consultar a unidade geológica do ponto.</p>
      </section>
      <aside className="card mx-right">
        <h3 className="eyebrow">Ficha da unidade</h3>
        {!pt && <p className="note">Clique no mapa.</p>}
        {geo?.loading && <p className="note">Consultando o Macrostrat…</p>}
        {geo && !geo.loading && !geo.ok && <p className="dv-warn">Macrostrat indisponível: {geo.error}</p>}
        {geo?.ok && !u && <p className="note">Sem unidade mapeada neste ponto (comum no mar e em algumas regiões sem mapa compilado).</p>}
        {u && (
          <dl className="mx-pass">
            <div><dt>Local</dt><dd>{fmt(pt.lat, 4)}°, {fmt(pt.lon, 4)}°</dd></div>
            <div><dt>Unidade</dt><dd><b>{u.name}</b>{u.strat_name && u.strat_name !== u.name ? ` (${u.strat_name})` : ""}</dd></div>
            <div><dt>Natureza da evidência</dt><dd>Litologia mapeada (não é mineral detectado)</dd></div>
            {u.lith && <div><dt>Litologia</dt><dd>{u.lith}</dd></div>}
            {u.age?.best && <div><dt>Idade</dt><dd>{u.age.best}{u.age.b_ma ? ` · ${fmt(u.age.t_ma, 1)}–${fmt(u.age.b_ma, 1)} milhões de anos` : ""}</dd></div>}
            {u.descrip && <div><dt>Descrição</dt><dd>{u.descrip}</dd></div>}
            <div><dt>Escala</dt><dd>{u.scale}{u.ref?.scale ? ` (${u.ref.scale})` : ""}</dd></div>
            {u.ref && <div><dt>Fonte original</dt><dd>{u.ref.url ? <a href={u.ref.url} target="_blank" rel="noopener noreferrer">{u.ref.name}</a> : u.ref.name}{u.ref.authors ? ` — ${u.ref.authors}` : ""}{u.ref.year ? ` (${u.ref.year})` : ""}</dd></div>}
            {geo.data.all.length > 1 && <div><dt>Outras escalas</dt><dd><ul>{geo.data.all.slice(1, 5).map((x, i) => <li key={i}>{x.scale}: {x.name}</li>)}</ul></dd></div>}
          </dl>
        )}
      </aside>
    </div>
  );
}

/* ---------------------------------------------------------------- Lua */
function MoonEvidence() {
  const data = useAraData();
  const sites = data.sitesOf("moon");
  const [id, setId] = useState(sites[0]?.id);
  const s = data.siteById(id), a = data.sites[id] ?? {};
  const th = a.thermal, mi = a.mineralogy, t = a.terrain;
  const rows = useMemo(() => [
    { cat: "Unidade geológica / geomorfologia", status: t ? "Derivado" : "Indisponível", text: t ? `Relevo LOLA: declividade média ${fmt(t.slope_mean_deg, 1)}°, amplitude ${fmt(t.relief_m, 0)} m na célula de 5 km.` : "—", src: "LRO LOLA (PGDA)" },
    { cat: "Iluminação", status: "Derivado", text: `A ${fmt(Math.abs(s?.center?.lat ?? 0), 1)}°S o Sol nunca sobe mais que ${fmt(90 - Math.abs(s?.center?.lat ?? 0) + 1.54, 1)}°. Sombras e % ao sol por hora: Laboratório 3D.`, src: "Geometria solar + relevo LOLA" },
    { cat: "Temperatura da superfície", status: th ? "Modelado" : "Indisponível", text: th ? `Média anual ${fmt(th.temp_mean_annual_k, 0)} K; máxima média ${fmt(th.temp_max_annual_mean_k, 0)} K; mínima média ${fmt(th.temp_mean_annual_lowest_k, 0)} K.` : "—", src: th ? `${th.source} (${th.product})` : "LRO Diviner" },
    { cat: "Assinatura mineralógica", status: mi?.exploratory_pixels ? "Exploratório" : "Indisponível", text: mi?.summary ?? (mi?.exploratory_pixels ? `${mi.exploratory_pixels} espectros exploratórios; bandas de 1 e 2 µm medidas, classificação mineral não validada.` : "Sem espectros válidos no recorte."), src: mi?.source ?? "Chandrayaan-1 M3" },
    { cat: "Hidrogênio / hidratação", status: "Indisponível", text: "Não integrado (LRO LEND / Lunar Prospector). Hidrogênio não é a mesma coisa que gelo.", src: "—" },
    { cat: "Gelo superficial", status: "Indisponível", text: "Não integrado. Radar (Mini-RF) sozinho não prova gelo; precisa de temperatura e iluminação junto.", src: "—" },
  ], [s, t, th, mi]);
  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="eyebrow mb-0">Evidências lunares por alvo</h3>
        <select className="field" style={{ maxWidth: 280 }} value={id} onChange={(e) => setId(e.target.value)}>
          {sites.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>
      <table className="data-table">
        <thead><tr><th>Categoria</th><th>Status</th><th>O que se sabe</th><th>Fonte</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.cat}><th scope="row">{r.cat}</th><td>{r.status}</td><td>{r.text}</td><td>{r.src}</td></tr>)}</tbody>
      </table>
      <p className="note">As categorias não são equivalentes: uma assinatura espectral não é um mineral identificado, hidrogênio não é gelo e temperatura modelada não é medida pontual.</p>
    </div>
  );
}

export default function MineralExplorer() {
  const [body, setBody] = useState("mars");
  return (
    <div className="mb-6">
      <div className="mb-3 max-w-[620px]"><Segmented asTabs label="Corpo" options={BODIES} value={body} onChange={setBody} /></div>
      {body === "mars" && <MarsMinerals />}
      {body === "earth" && <EarthGeology />}
      {body === "moon" && <MoonEvidence />}
    </div>
  );
}
