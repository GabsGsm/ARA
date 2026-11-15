// Laboratório de dados — "Como chegamos a isso": um experimento guiado que mostra como resolução, ruído,
// lacunas e processamento das imagens mudam o que conseguimos afirmar sobre um análogo.
// Os dados de partida são reais (DEM e imagem da célula da Terra); as degradações são SIMULAÇÕES, sempre rotuladas.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as core from "../lib/core.js";
import { useAraData } from "../hooks/useAraData.jsx";
import { loadIndex, loadScene } from "../lib/terrain3d/data.js";
import { crop, hillshade, metrics, midProfile, paint, processDEM, slopeMap, sobel, texture } from "../lib/datalab/process.js";
import { canSound, canSpeak, sonify, speak, stopSound, stopSpeaking } from "../lib/a11y/sense.js";
import { fmt } from "../lib/format.js";
import StatusChip from "../components/ui/StatusChip.jsx";
import "../assets/css/datalab.css";

const ATTRS = core.RANK_ATTRS;
const VIEWS = [
  { id: "imagem", label: "Imagem" }, { id: "sombra", label: "Relevo sombreado" }, { id: "declividade", label: "Declividade" },
  { id: "bordas", label: "Bordas (Sobel)" }, { id: "textura", label: "Textura" },
];
const RES = [0, 50, 100, 200, 300, 500];   // 0 = original

const STEPS = [
  { id: "orig", title: "O dado original", view: "sombra",
    what: "Cada pixel do modelo digital de elevação (DEM) guarda uma altitude. Daqui saem as três medidas do ARA: declividade, rugosidade e amplitude do relevo, calculadas em blocos de 100 m na célula de 5 km.",
    look: "Compare a imagem de satélite com o relevo sombreado: a imagem mostra cor e brilho, o DEM mostra forma. O ranking usa só a forma." },
  { id: "res", title: "Resolução: o tamanho do pixel", view: "sombra", control: "res",
    what: "Cada sensor enxerga com um tamanho de pixel. Pixels maiores calculam a média do que está dentro deles: crateras pequenas, cristas e degraus somem.",
    look: "Suba para 300 m. A declividade cai, porque a média apaga as encostas curtas — isso está descrito na literatura (Zhang & Montgomery 1994; Grohmann 2015). Acima de 100 m, a rugosidade do ARA passa a ser medida numa escala diferente da do planeta e deixa de ser comparável." },
  { id: "noise", title: "Ruído do sensor e do processamento", view: "declividade", control: "noise",
    what: "Todo DEM tem erro vertical. No SRTM, por exemplo, o erro absoluto é da ordem de 5 a 10 m (Farr et al. 2007).",
    look: "Com ruído, terreno plano parece áspero: a rugosidade e a declividade sobem sem o lugar mudar. Um análogo pode parecer mais parecido (ou menos) por causa do erro, não do relevo." },
  { id: "gaps", title: "Lacunas: onde não há dado", view: "sombra", control: "gaps",
    what: "Sombra de radar, nuvens, encostas íngremes e faixas fora de cobertura deixam buracos no mapa.",
    look: "As áreas em xadrez não entram no cálculo. Com muitas lacunas, a amplitude perde os pontos mais altos ou mais baixos e a cobertura cai: a medida pode até sair parecida, mas sustentada por menos terreno." },
  { id: "smooth", title: "Filtro de suavização", view: "sombra", control: "smooth",
    what: "Filtros passa-baixa limpam o ruído, mas também apagam detalhes reais. É uma troca, não uma correção.",
    look: "Volte o ruído para 5 m e aplique 2 px de suavização: a rugosidade volta a cair. Exagere e as bordas das crateras somem." },
  { id: "edges", title: "Bordas: onde o relevo quebra", view: "bordas",
    what: "O operador de Sobel mede a mudança de altura entre vizinhos. Valores altos marcam bordas de cratera, cristas e escarpas — feições que um geólogo procuraria num análogo.",
    look: "Compare as bordas do original e do processado: quantas feições sobreviveram à resolução, ao ruído e ao filtro?" },
  { id: "texture", title: "Textura: a rugosidade pixel a pixel", view: "textura",
    what: "Desvio-padrão local das altitudes numa janela de 5 × 5 pixels. É a versão em mapa da rugosidade do ARA.",
    look: "Ruído deixa a textura granulada e uniforme; resolução grossa a deixa em blocos. Nas duas, a textura deixa de representar o chão de verdade." },
  { id: "verdict", title: "O que os dados sustentam", view: "sombra",
    what: "Extraímos de novo as três medidas, comparamos com o local da missão e julgamos se cada conclusão continua de pé.",
    look: "Parecer igual não basta: a pergunta é se o dado tem resolução, cobertura e qualidade para sustentar a comparação." },
];

const SRC = [
  ["Zhang & Montgomery (1994) — DEM grid size, landscape representation, and hydrologic simulations, Water Resources Research 30(4)", "https://doi.org/10.1029/93WR03553"],
  ["Grohmann (2015) — Effects of spatial resolution on slope and aspect derivation for regional-scale analysis, Computers & Geosciences 77", "https://doi.org/10.1016/j.cageo.2015.02.003"],
  ["Farr et al. (2007) — The Shuttle Radar Topography Mission, Reviews of Geophysics 45", "https://doi.org/10.1029/2005RG000183"],
  ["Kirk et al. (2008) — Ultrahigh resolution topographic mapping of Mars with MRO HiRISE stereo images, JGR Planets", "https://doi.org/10.1029/2007JE003000"],
  ["Horn (1981) — Hill shading and the reflectance map, Proceedings of the IEEE 69(1) (declividade e sombreamento)", "https://doi.org/10.1109/PROC.1981.11918"],
  ["OpenCV — Sobel derivatives (operador de bordas)", "https://docs.opencv.org/4.x/d2/d2c/tutorial_sobel_derivatives.html"],
  ["NASA Earthdata — Remote sensing basics (resolução espacial, sensores)", "https://www.earthdata.nasa.gov/learn/earth-observation-data-basics/remote-sensing"],
  ["NASA Chandra — A Universe of Sound (sonificação de dados científicos)", "https://chandra.si.edu/sound/"],
  ["W3C — WCAG 2.2 (acessibilidade)", "https://www.w3.org/TR/WCAG22/"],
];

function Canvas({ field, n, view, opts, label, imageSrc, k, valid }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !n) return;
    cv.width = n; cv.height = n;
    const ctx = cv.getContext("2d");
    if (view === "imagem" && imageSrc) {
      const { bmp, sx, sy, sw } = imageSrc;
      const m = Math.max(1, Math.round(n / (k || 1)));
      const tmp = new OffscreenCanvas(m, m), tc = tmp.getContext("2d");
      tc.drawImage(bmp, sx, sy, sw, sw, 0, 0, m, m);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, m, m, 0, 0, n, n);
      if (valid) {
        const img = ctx.getImageData(0, 0, n, n), d = img.data;
        for (let i = 0; i < n * n; i++) if (!valid[i]) { const x = i % n, y = (i / n) | 0, c = ((x >> 3) + (y >> 3)) % 2 ? 70 : 40; d[i * 4] = c; d[i * 4 + 1] = c; d[i * 4 + 2] = c + 10; }
        ctx.putImageData(img, 0, 0);
      }
      return;
    }
    if (field) paint(ctx, field, n, opts);
  }, [field, n, view, opts, imageSrc, k, valid]);
  return <canvas ref={ref} className="dl-canvas" role="img" aria-label={label} />;
}

function verdictFor(attr, orig, proc, mission, cfg, pr) {
  const sc = cfg.attributes[attr].scale, th = cfg.thresholds;
  const so = core.dimensionStatus(mission[attr], orig[attr], sc, th).status;
  const sp = core.dimensionStatus(mission[attr], proc[attr], sc, th).status;
  const shift = Math.abs((proc[attr] - orig[attr]) / sc);
  const reasons = [];
  if (pr.res > 100 && attr !== "relief_m") reasons.push(`pixel de ${fmt(pr.res, 0)} m, maior que a escala de 100 m da medida`);
  if (pr.coverage < 0.8) reasons.push(`só ${fmt(pr.coverage * 100, 0)}% da célula tem dado`);
  if (pr.noise > 0 && attr !== "relief_m" && pr.noise > 0.3 * (orig.roughness_mean_m || 1)) reasons.push(`ruído de ${fmt(pr.noise, 0)} m comparável à rugosidade real`);
  if (pr.noise > 0 && attr === "relief_m") reasons.push("picos de ruído inflam o máximo e o mínimo");
  if (shift > th.good) reasons.push(`a medida mudou ${fmt(shift, 2)} escalas`);
  const changed = so !== sp;
  const level = changed || reasons.length >= 2 || shift > th.weak ? "nao" : reasons.length ? "incerto" : "sim";
  return { so, sp, shift, reasons, changed, level };
}

export default function DataLab() {
  const data = useAraData();
  const [index, setIndex] = useState([]);
  const [siteId, setSiteId] = useState("jezero_04");
  const [earthId, setEarthId] = useState(null);
  const [scene, setScene] = useState(null);
  const [stepI, setStepI] = useState(0);
  const [free, setFree] = useState(false);
  const [view, setView] = useState("sombra");
  const [opt, setOpt] = useState({ res: 0, noise: 0, gaps: 0, smooth: 0 });

  useEffect(() => { loadIndex().then((ix) => setIndex(ix.scenes)); }, []);
  const missions = useMemo(() => data.catalog.sites.filter((s) => s.body !== "earth" && data.sites[s.id]?.terrain), [data]);
  const earthScenes = useMemo(() => index.filter((s) => s.body === "earth" && s.stats_inner?.at_100m), [index]);
  const mission = data.sites[siteId]?.terrain;
  const weights = useMemo(() => core.normalizeWeights(data.config.objectives.default.weights), [data]);
  const scales = useMemo(() => core.scalesFrom(data.config), [data]);
  // análogos com cena 3D, ordenados pela distância ARA ao local da missão
  const ranked = useMemo(() => (mission ? earthScenes.map((s) => ({ s, d: core.distance(mission, s.stats_inner.at_100m, weights, scales) })).sort((a, b) => a.d - b.d) : []), [earthScenes, mission, weights, scales]);
  useEffect(() => { if (ranked.length && !ranked.some((r) => r.s.id === earthId)) setEarthId(ranked[0].s.id); }, [ranked]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!earthId) return;
    let alive = true; setScene(null);
    loadScene(earthId).then((s) => alive && setScene(s));
    return () => { alive = false; };
  }, [earthId]);

  const step = STEPS[stepI];
  useEffect(() => { if (!free) setView(step.view); }, [stepI, free]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- recorte da célula central (5 km) e processamento
  const base = useMemo(() => {
    if (!scene) return null;
    const c = crop(scene.heights, scene.n, 0.5), r0 = scene.meta.size_m / scene.n;
    const bmp = scene.color;
    const imageSrc = bmp ? { bmp, sx: bmp.width * 0.25, sy: bmp.height * 0.25, sw: bmp.width * 0.5 } : null;
    return { ...c, r0, imageSrc, m: metrics(c.h, c.n, r0) };
  }, [scene]);
  const proc = useMemo(() => {
    if (!base) return null;
    const p = processDEM(base.h, base.n, base.r0, { ...opt, res: opt.res || base.r0 });
    const m = metrics(p.coarse, p.m, p.res);
    return { ...p, m };
  }, [base, opt]);

  const fields = useMemo(() => {
    if (!base || !proc) return null;
    const mk = (h, n, res) => {
      if (view === "sombra") return { f: hillshade(h, n, res), o: { lo: 0, hi: 1, ramp: "gray" } };
      if (view === "declividade") return { f: slopeMap(h, n, res).s, o: { lo: 0, hi: 35, ramp: "slope" } };
      if (view === "bordas") { const e = sobel(h, n); return { f: e, o: { lo: 0, hi: edgeHi, ramp: "edge" } }; }
      if (view === "textura") return { f: texture(h, n, 2), o: { lo: 0, hi: texHi, ramp: "heat" } };
      return { f: null, o: null };
    };
    const eo = sobel(base.h, base.n); let edgeHi = 0; for (const v of eo) if (v > edgeHi) edgeHi = v; edgeHi *= 0.5;
    const to = texture(base.h, base.n, 2); let texHi = 0; for (const v of to) if (v > texHi) texHi = v; texHi *= 0.7;
    const a = mk(base.h, base.n, base.r0), b = mk(proc.h, proc.n, base.r0);
    // fração de bordas fortes (acima de metade do máximo original)
    const thr = edgeHi * 0.5, ep = view === "bordas" ? b.f : sobel(proc.h, proc.n);
    let eA = 0, eB = 0; for (let i = 0; i < eo.length; i++) { if (eo[i] > thr) eA++; if (ep[i] > thr) eB++; }
    return { a, b, edges: { a: eA / eo.length, b: eB / eo.length } };
  }, [base, proc, view]);

  // ---- veredito
  const res = useMemo(() => {
    if (!base || !proc || !mission) return null;
    const pr = { res: proc.m.res_m, coverage: proc.m.coverage, noise: opt.noise };
    const rows = ATTRS.map((a) => ({ attr: a, label: data.config.attributes[a].label, unit: data.config.attributes[a].unit, mission: mission[a], orig: base.m[a], proc: proc.m[a], ...verdictFor(a, base.m, proc.m, mission, data.config, pr) }));
    const dO = core.distance(mission, base.m, weights, scales), dP = core.distance(mission, proc.m, weights, scales);
    const worst = rows.some((r) => r.level === "nao") ? "nao" : rows.some((r) => r.level === "incerto") ? "incerto" : "sim";
    return { rows, dO, dP, worst, pr };
  }, [base, proc, mission, opt.noise, data, weights, scales]);

  const site = data.siteById(siteId), earth = earthScenes.find((s) => s.id === earthId);
  const changed = opt.res || opt.noise || opt.gaps || opt.smooth;
  const chain = [opt.res ? `pixel ${opt.res} m` : null, opt.noise ? `ruído ±${opt.noise} m` : null, opt.gaps ? `${Math.round(opt.gaps * 100)}% sem dado` : null, opt.smooth ? `suavização ${opt.smooth} px` : null].filter(Boolean);
  const WORD = { sim: "sustentada", incerto: "incerta", nao: "não sustentada" };

  // ---- descrição em texto (leitor de tela e narração)
  const description = useMemo(() => {
    if (!res || !earth || !site) return "";
    const rowsTxt = res.rows.map((r) => `${r.label}: missão ${fmt(r.mission, 1)} ${r.unit}, original ${fmt(r.orig, 1)}, processado ${fmt(r.proc, 1)}; conclusão ${WORD[r.level]}${r.reasons.length ? ` porque ${r.reasons.join(" e ")}` : ""}.`).join(" ");
    return `Comparando ${site.name} com ${earth.name}. ${chain.length ? `Processamento aplicado: ${chain.join(", ")}.` : "Dados originais, sem processamento."} ` +
      `Distância ARA passou de ${fmt(res.dO, 3)} para ${fmt(res.dP, 3)}. ${rowsTxt} ` +
      `Bordas fortes: ${fmt(fields?.edges.a * 100, 1)}% da célula no original e ${fmt(fields?.edges.b * 100, 1)}% no processado. ` +
      `Veredito geral: comparação ${WORD[res.worst]}.`;
  }, [res, earth, site, chain, fields]); // eslint-disable-line react-hooks/exhaustive-deps

  const listen = () => {
    if (!base || !proc || !scene) return;
    const ms = index.find((s) => s.id === siteId);
    const play = (mp) => sonify([
      ...(mp ? [{ values: mp, label: "missão" }] : []),
      { values: midProfile(base.h, base.n), label: "Terra original" },
      { values: midProfile(proc.h, proc.n), label: "Terra processada" },
    ]);
    if (ms) loadScene(siteId).then((s) => { const c = crop(s.heights, s.n, 0.5); play(midProfile(c.h, c.n)); }).catch(() => play(null));
    else play(null);
    if (canSpeak()) speak(ms ? "Três perfis de oeste para leste: primeiro o local da missão, depois o análogo original, depois o processado. Agudo é alto, grave é baixo, chiado é terreno áspero, silêncio é lacuna." : "Dois perfis: original e processado.");
  };
  useEffect(() => () => { stopSound(); stopSpeaking(); }, []);

  const set = (k, v) => setOpt((o) => ({ ...o, [k]: v }));
  const showCtl = (c) => free || step.control === c;

  return (
    <section aria-labelledby="dlTitle" className="dl-page mx-auto max-w-[1640px] px-[clamp(12px,2vw,30px)] pt-6 pb-10">
      <header className="dl-head">
        <div>
          <p className="eyebrow mb-1">Laboratório de dados · como chegamos a isso</p>
          <h1 id="dlTitle" className="dl-title">Os dados sustentam a semelhança?</h1>
          <p className="desc m-0 max-w-[900px]">Dois lugares parecidos na foto não bastam. Aqui você degrada e processa o relevo real de um análogo, passo a passo, e vê quando a comparação com {site?.body === "moon" ? "a Lua" : "Marte"} deixa de se sustentar.</p>
        </div>
        <div className="dl-pick">
          <label>Local da missão
            <select className="field" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              {missions.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.body === "moon" ? "Lua" : "Marte"})</option>)}
            </select>
          </label>
          <label>Análogo na Terra
            <select className="field" value={earthId ?? ""} onChange={(e) => setEarthId(e.target.value)}>
              {ranked.map((r, i) => <option key={r.s.id} value={r.s.id}>{i + 1}º · {r.s.name} (d = {fmt(r.d, 3)})</option>)}
            </select>
          </label>
        </div>
      </header>

      <div className="dl-layout">
        {/* ---------- roteiro ---------- */}
        <aside className="dl-steps card" aria-label="Roteiro do experimento">
          <div className="dl-mode" role="radiogroup" aria-label="Modo">
            <button type="button" role="radio" aria-checked={!free} onClick={() => setFree(false)}>Guiado</button>
            <button type="button" role="radio" aria-checked={free} onClick={() => setFree(true)}>Livre</button>
          </div>
          {!free && (
            <ol className="dl-list">
              {STEPS.map((s, i) => (
                <li key={s.id}><button type="button" aria-current={i === stepI ? "step" : undefined} onClick={() => setStepI(i)}><span>{i + 1}</span>{s.title}</button></li>
              ))}
            </ol>
          )}
          <div className="dl-step">
            {!free && <><h2>{stepI + 1}. {step.title}</h2><p>{step.what}</p><p className="dl-look"><b>Observe:</b> {step.look}</p></>}
            {free && <p>Todos os controles juntos. Combine resolução, ruído, lacunas e filtro e acompanhe o veredito.</p>}

            {showCtl("res") && (
              <fieldset className="dl-ctl"><legend>Tamanho do pixel</legend>
                <div className="dl-chips">{RES.map((r) => <button key={r} type="button" aria-pressed={opt.res === r} onClick={() => set("res", r)}>{r ? `${r} m` : `original (${fmt(base?.r0 ?? 20, 0)} m)`}</button>)}</div>
              </fieldset>
            )}
            {showCtl("noise") && (
              <label className="dl-range"><span>Ruído vertical <b>±{opt.noise} m</b></span>
                <input type="range" min="0" max="20" step="1" value={opt.noise} onChange={(e) => set("noise", Number(e.target.value))} /></label>
            )}
            {showCtl("gaps") && (
              <label className="dl-range"><span>Área sem dado <b>{Math.round(opt.gaps * 100)}%</b></span>
                <input type="range" min="0" max="0.6" step="0.05" value={opt.gaps} onChange={(e) => set("gaps", Number(e.target.value))} /></label>
            )}
            {showCtl("smooth") && (
              <label className="dl-range"><span>Suavização <b>{opt.smooth} px</b></span>
                <input type="range" min="0" max="6" step="1" value={opt.smooth} onChange={(e) => set("smooth", Number(e.target.value))} /></label>
            )}
            {!free && (
              <div className="dl-nav">
                <button type="button" disabled={stepI === 0} onClick={() => setStepI((i) => i - 1)}>← Anterior</button>
                <button type="button" className="gold" disabled={stepI === STEPS.length - 1} onClick={() => setStepI((i) => i + 1)}>Próximo →</button>
              </div>
            )}
            <button type="button" className="dl-reset" disabled={!changed} onClick={() => setOpt({ res: 0, noise: 0, gaps: 0, smooth: 0 })}>Voltar aos dados originais</button>
          </div>
        </aside>

        {/* ---------- antes e depois ---------- */}
        <div className="dl-main">
          <div className="dl-views" role="radiogroup" aria-label="O que mostrar">
            {VIEWS.map((v) => <button key={v.id} type="button" role="radio" aria-checked={view === v.id} onClick={() => setView(v.id)} disabled={v.id === "imagem" && !scene?.color}>{v.label}</button>)}
          </div>
          <div className="dl-pair">
            <figure className="dl-fig">
              <figcaption><b>Original</b> · dado real, pixel de {fmt(base?.r0 ?? 0, 0)} m</figcaption>
              {base && fields ? <Canvas field={fields.a.f} n={base.n} view={view} opts={fields.a.o} imageSrc={base.imageSrc} k={1} label={`Original: ${VIEWS.find((v) => v.id === view).label} de ${earth?.name}`} /> : <div className="dl-canvas dl-wait">Carregando…</div>}
            </figure>
            <figure className="dl-fig">
              <figcaption><b>Processado</b> {changed ? <span className="dl-sim">simulação</span> : "· igual ao original"} {chain.length ? `· ${chain.join(" · ")}` : ""}</figcaption>
              {proc && fields ? <Canvas field={fields.b.f} n={proc.n} view={view} opts={fields.b.o} imageSrc={base.imageSrc} k={proc.k} valid={proc.valid} label={`Processado: ${VIEWS.find((v) => v.id === view).label}; ${chain.join(", ") || "sem alteração"}`} /> : <div className="dl-canvas dl-wait">…</div>}
            </figure>
          </div>
          <p className="dl-legend">
            {view === "declividade" && "Verde = plano · amarelo ≈ 15° · vermelho ≥ 35°. "}
            {view === "bordas" && `Bordas fortes: ${fmt(fields?.edges.a * 100, 1)}% da célula no original → ${fmt(fields?.edges.b * 100, 1)}% no processado. `}
            {view === "textura" && "Escuro = liso · claro = áspero (desvio-padrão local, 5 × 5 px). "}
            {view === "sombra" && "Luz vinda do noroeste a 45°. "}
            Xadrez = sem dado. Célula de 5 × 5 km de {earth?.name}.
          </p>
          <div className="dl-a11y">
            {canSound() && <button type="button" onClick={listen}>🔊 Ouvir o relevo</button>}
            {canSpeak() && <button type="button" onClick={() => speak(description)}>🗣 Narrar o resultado</button>}
            <button type="button" onClick={() => { stopSound(); stopSpeaking(); }}>Parar</button>
            <small>No som, agudo = alto, grave = baixo, chiado = terreno áspero e silêncio = lacuna.</small>
          </div>
          <p className="sr-only" aria-live="polite">{description}</p>
        </div>

        {/* ---------- veredito ---------- */}
        <aside className="dl-verdict card" aria-label="O que os dados sustentam">
          <h2 className="eyebrow mb-2">O que os dados sustentam</h2>
          {res && (
            <>
              <div className={`dl-big ${res.worst}`}>
                <span>Comparação</span><b>{WORD[res.worst]}</b>
                <small>distância ARA {fmt(res.dO, 3)} → <b>{fmt(res.dP, 3)}</b> · cobertura {fmt(res.pr.coverage * 100, 0)}% · medida a {fmt(res.pr.res, 0)} m</small>
              </div>
              <table className="data-table dl-table">
                <thead><tr><th /><th>{site?.body === "moon" ? "Lua" : "Marte"}</th><th>Original</th><th>Processado</th></tr></thead>
                <tbody>
                  {res.rows.map((r) => (
                    <tr key={r.attr}>
                      <th scope="row">{r.label}</th>
                      <td>{fmt(r.mission, 1)} {r.unit}</td>
                      <td>{fmt(r.orig, 1)}<StatusChip status={r.so} /></td>
                      <td>{fmt(r.proc, 1)}<StatusChip status={r.sp} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="dl-reasons">
                {res.rows.map((r) => (
                  <li key={r.attr} className={r.level}>
                    <b>{r.label}: {WORD[r.level]}.</b> {r.changed ? "A classificação mudou com o processamento. " : ""}{r.reasons.length ? `${r.reasons.join("; ")}.` : "Resolução, cobertura e ruído compatíveis com a medida."}
                  </li>
                ))}
              </ul>
              <h3 className="dl-h">O que continua incerto em qualquer caso</h3>
              <ul className="dl-unc">
                <li>Gravidade, pressão, temperatura e radiação — ver <Link to="/explorar">Pressão e temperatura</Link> no Explorar.</li>
                <li>Mineralogia: litologia mapeada não é mineral verificado.</li>
                <li>Pedras menores que o pixel: nenhum DEM desta escala mostra.</li>
                <li>DEMs da Terra e do planeta vêm de instrumentos diferentes (ex.: HiRISE ≈ 1 m, Kirk et al. 2008; SRTM ≈ 30 m).</li>
              </ul>
            </>
          )}
          <details className="dl-src"><summary>Fontes e método</summary>
            <p className="t3-note">Dados de partida: DEM e imagem reais da célula (AWS Terrain Tiles / Esri), recortados em 5 × 5 km. Degradações: média em blocos, ruído gaussiano, manchas sem dado e filtro de média móvel, todos com semente fixa. Medidas: as mesmas do ARA (blocos de 100 m). Regras do veredito: a medida perde sustentação se o pixel for maior que 100 m (declividade e rugosidade), se a cobertura cair abaixo de 80%, se o ruído for comparável à rugosidade real, ou se a classificação mudar.</p>
            <ul>{SRC.map(([t, u]) => <li key={u}><a href={u} target="_blank" rel="noopener noreferrer">{t} ↗</a></li>)}</ul>
          </details>
        </aside>
      </div>
    </section>
  );
}
