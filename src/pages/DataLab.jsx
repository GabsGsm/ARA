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
import { useSettings } from "../hooks/useSettings.jsx";
import StatusChip from "../components/ui/StatusChip.jsx";
import "../assets/css/datalab.css";

const ATTRS = core.RANK_ATTRS;
const ATTR_EN = { slope_mean_deg: "Mean slope", roughness_mean_m: "Mean roughness", relief_m: "Relief" };
const VIEWS = [
  { id: "imagem", label: ["Imagem", "Image"] }, { id: "sombra", label: ["Relevo sombreado", "Hillshade"] }, { id: "declividade", label: ["Declividade", "Slope"] },
  { id: "bordas", label: ["Bordas (Sobel)", "Edges (Sobel)"] }, { id: "textura", label: ["Textura", "Texture"] },
];
const RES = [0, 50, 100, 200, 300, 500];   // 0 = original

const STEPS = [
  { id: "orig", view: "sombra", title: ["O dado original", "The original data"],
    what: ["Cada pixel do modelo digital de elevação (DEM) guarda uma altitude. Daqui saem as três medidas do ARA: declividade, rugosidade e amplitude do relevo, calculadas em blocos de 100 m na célula de 5 km.",
      "Each pixel of the digital elevation model (DEM) stores an altitude. ARA's three measures come from it: slope, roughness and relief, computed in 100 m blocks over the 5 km cell."],
    look: ["Compare a imagem de satélite com o relevo sombreado: a imagem mostra cor e brilho, o DEM mostra forma. O ranking usa só a forma.",
      "Compare the satellite image with the hillshade: the image shows colour and brightness, the DEM shows shape. The ranking uses shape only."] },
  { id: "res", view: "sombra", control: "res", title: ["Resolução: o tamanho do pixel", "Resolution: pixel size"],
    what: ["Cada sensor enxerga com um tamanho de pixel. Pixels maiores calculam a média do que está dentro deles: crateras pequenas, cristas e degraus somem.",
      "Every sensor sees with a pixel size. Larger pixels average what is inside them: small craters, ridges and ledges disappear."],
    look: ["Suba para 300 m. A declividade cai, porque a média apaga as encostas curtas — isso está descrito na literatura (Zhang & Montgomery 1994; Grohmann 2015). Acima de 100 m, a rugosidade do ARA passa a ser medida numa escala diferente da do planeta e deixa de ser comparável.",
      "Go to 300 m. Slope drops because averaging erases short slopes — as described in the literature (Zhang & Montgomery 1994; Grohmann 2015). Above 100 m, ARA's roughness is measured at a different scale from the planet's and is no longer comparable."] },
  { id: "noise", view: "declividade", control: "noise", title: ["Ruído do sensor e do processamento", "Sensor and processing noise"],
    what: ["Todo DEM tem erro vertical. No SRTM, por exemplo, o erro absoluto é da ordem de 5 a 10 m (Farr et al. 2007).",
      "Every DEM has vertical error. For SRTM, for instance, absolute error is about 5 to 10 m (Farr et al. 2007)."],
    look: ["Com ruído, terreno plano parece áspero: a rugosidade e a declividade sobem sem o lugar mudar. Um análogo pode parecer mais parecido (ou menos) por causa do erro, não do relevo.",
      "With noise, flat ground looks rough: roughness and slope rise although the place did not change. An analog may look more (or less) similar because of error, not relief."] },
  { id: "gaps", view: "sombra", control: "gaps", title: ["Lacunas: onde não há dado", "Gaps: where there is no data"],
    what: ["Sombra de radar, nuvens, encostas íngremes e faixas fora de cobertura deixam buracos no mapa.",
      "Radar shadow, clouds, steep slopes and uncovered strips leave holes in the map."],
    look: ["As áreas em xadrez não entram no cálculo. Com muitas lacunas, a amplitude perde os pontos mais altos ou mais baixos e a cobertura cai: a medida pode até sair parecida, mas sustentada por menos terreno.",
      "Checkered areas are left out. With many gaps, relief loses its highest or lowest points and coverage drops: the number may look similar, but it rests on less ground."] },
  { id: "smooth", view: "sombra", control: "smooth", title: ["Filtro de suavização", "Smoothing filter"],
    what: ["Filtros passa-baixa limpam o ruído, mas também apagam detalhes reais. É uma troca, não uma correção.",
      "Low-pass filters clean noise but also erase real detail. It is a trade-off, not a fix."],
    look: ["Volte o ruído para 5 m e aplique 2 px de suavização: a rugosidade volta a cair. Exagere e as bordas das crateras somem.",
      "Set noise to 5 m and apply 2 px smoothing: roughness drops again. Overdo it and crater rims vanish."] },
  { id: "edges", view: "bordas", title: ["Bordas: onde o relevo quebra", "Edges: where relief breaks"],
    what: ["O operador de Sobel mede a mudança de altura entre vizinhos. Valores altos marcam bordas de cratera, cristas e escarpas — feições que um geólogo procuraria num análogo.",
      "The Sobel operator measures height change between neighbours. High values mark crater rims, ridges and scarps — features a geologist would look for in an analog."],
    look: ["Compare as bordas do original e do processado: quantas feições sobreviveram à resolução, ao ruído e ao filtro?",
      "Compare original and processed edges: how many features survived resolution, noise and filtering?"] },
  { id: "texture", view: "textura", title: ["Textura: a rugosidade pixel a pixel", "Texture: roughness pixel by pixel"],
    what: ["Desvio-padrão local das altitudes numa janela de 5 × 5 pixels. É a versão em mapa da rugosidade do ARA.",
      "Local standard deviation of altitude in a 5 × 5 pixel window. It is the map version of ARA's roughness."],
    look: ["Ruído deixa a textura granulada e uniforme; resolução grossa a deixa em blocos. Nas duas, a textura deixa de representar o chão de verdade.",
      "Noise makes texture grainy and uniform; coarse resolution makes it blocky. Either way it stops representing the real ground."] },
  { id: "verdict", view: "sombra", title: ["O que os dados sustentam", "What the data supports"],
    what: ["Extraímos de novo as três medidas, comparamos com o local da missão e julgamos se cada conclusão continua de pé.",
      "We re-extract the three measures, compare them with the mission site and judge whether each conclusion still stands."],
    look: ["Parecer igual não basta: a pergunta é se o dado tem resolução, cobertura e qualidade para sustentar a comparação.",
      "Looking alike is not enough: the question is whether the data has the resolution, coverage and quality to support the comparison."] },
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

function verdictFor(attr, orig, proc, mission, cfg, pr, tr) {
  const sc = cfg.attributes[attr].scale, th = cfg.thresholds;
  const so = core.dimensionStatus(mission[attr], orig[attr], sc, th).status;
  const sp = core.dimensionStatus(mission[attr], proc[attr], sc, th).status;
  const shift = Math.abs((proc[attr] - orig[attr]) / sc);
  const reasons = [];
  if (pr.res > 100 && attr !== "relief_m") reasons.push(tr(`pixel de ${fmt(pr.res, 0)} m, maior que a escala de 100 m da medida`, `${fmt(pr.res, 0)} m pixel, larger than the 100 m measurement scale`));
  if (pr.coverage < 0.8) reasons.push(tr(`só ${fmt(pr.coverage * 100, 0)}% da célula tem dado`, `only ${fmt(pr.coverage * 100, 0)}% of the cell has data`));
  if (pr.noise > 0 && attr !== "relief_m" && pr.noise > 0.3 * (orig.roughness_mean_m || 1)) reasons.push(tr(`ruído de ${fmt(pr.noise, 0)} m comparável à rugosidade real`, `${fmt(pr.noise, 0)} m noise comparable to the real roughness`));
  if (pr.noise > 0 && attr === "relief_m") reasons.push(tr("picos de ruído inflam o máximo e o mínimo", "noise spikes inflate the maximum and minimum"));
  if (shift > th.good) reasons.push(tr(`a medida mudou ${fmt(shift, 2)} escalas`, `the measure moved ${fmt(shift, 2)} scales`));
  const changed = so !== sp;
  const level = changed || reasons.length >= 2 || shift > th.weak ? "nao" : reasons.length ? "incerto" : "sim";
  return { so, sp, shift, reasons, changed, level };
}

export default function DataLab() {
  const data = useAraData();
  const { tr, lang, narration, sounds } = useSettings();
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
    const rows = ATTRS.map((a) => ({ attr: a, label: tr(data.config.attributes[a].label, ATTR_EN[a]), unit: data.config.attributes[a].unit, mission: mission[a], orig: base.m[a], proc: proc.m[a], ...verdictFor(a, base.m, proc.m, mission, data.config, pr, tr) }));
    const dO = core.distance(mission, base.m, weights, scales), dP = core.distance(mission, proc.m, weights, scales);
    const worst = rows.some((r) => r.level === "nao") ? "nao" : rows.some((r) => r.level === "incerto") ? "incerto" : "sim";
    return { rows, dO, dP, worst, pr };
  }, [base, proc, mission, opt.noise, data, weights, scales, tr]);

  const site = data.siteById(siteId), earth = earthScenes.find((s) => s.id === earthId);
  const changed = opt.res || opt.noise || opt.gaps || opt.smooth;
  const chain = [opt.res ? `pixel ${opt.res} m` : null, opt.noise ? tr(`ruído ±${opt.noise} m`, `noise ±${opt.noise} m`) : null, opt.gaps ? tr(`${Math.round(opt.gaps * 100)}% sem dado`, `${Math.round(opt.gaps * 100)}% no data`) : null, opt.smooth ? tr(`suavização ${opt.smooth} px`, `smoothing ${opt.smooth} px`) : null].filter(Boolean);
  const WORD = { sim: tr("sustentada", "supported"), incerto: tr("incerta", "uncertain"), nao: tr("não sustentada", "not supported") };

  // ---- descrição em texto (leitor de tela e narração)
  const description = useMemo(() => {
    if (!res || !earth || !site) return "";
    if (lang === "en") {
      const rowsEn = res.rows.map((r) => `${r.label}: mission ${fmt(r.mission, 1)} ${r.unit}, original ${fmt(r.orig, 1)}, processed ${fmt(r.proc, 1)}; conclusion ${WORD[r.level]}${r.reasons.length ? ` because ${r.reasons.join(" and ")}` : ""}.`).join(" ");
      return `Comparing ${site.name} with ${earth.name}. ${chain.length ? `Processing applied: ${chain.join(", ")}.` : "Original data, no processing."} ` +
        `ARA distance went from ${fmt(res.dO, 3)} to ${fmt(res.dP, 3)}. ${rowsEn} ` +
        `Strong edges: ${fmt(fields?.edges.a * 100, 1)}% of the cell in the original and ${fmt(fields?.edges.b * 100, 1)}% in the processed data. ` +
        `Overall verdict: comparison ${WORD[res.worst]}.`;
    }
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
    if (canSpeak() && narration) speak(ms ? tr("Três perfis de oeste para leste: primeiro o local da missão, depois o análogo original, depois o processado. Agudo é alto, grave é baixo, chiado é terreno áspero, silêncio é lacuna.", "Three west-to-east profiles: first the mission site, then the original analog, then the processed one. High pitch is high ground, low pitch is low ground, hiss is rough terrain, silence is a gap.") : tr("Dois perfis: original e processado.", "Two profiles: original and processed."), lang);
  };
  useEffect(() => () => { stopSound(); stopSpeaking(); }, []);

  const set = (k, v) => setOpt((o) => ({ ...o, [k]: v }));
  const showCtl = (c) => free || step.control === c;

  return (
    <section aria-labelledby="dlTitle" className="dl-page mx-auto max-w-[1640px] px-[clamp(12px,2vw,30px)] pt-6 pb-10">
      <header className="dl-head">
        <div>
          <p className="eyebrow mb-1">{tr("Laboratório de dados · como chegamos a isso", "Data lab · how we got there")}</p>
          <h1 id="dlTitle" className="dl-title">{tr("Os dados sustentam a semelhança?", "Does the data support the similarity?")}</h1>
          <p className="desc m-0 max-w-[900px]">{tr(`Dois lugares parecidos na foto não bastam. Aqui você degrada e processa o relevo real de um análogo, passo a passo, e vê quando a comparação com ${site?.body === "moon" ? "a Lua" : "Marte"} deixa de se sustentar.`, `Two places that look alike in a photo are not enough. Here you degrade and process the real relief of an analog, step by step, and see when the comparison with ${site?.body === "moon" ? "the Moon" : "Mars"} stops holding up.`)}</p>
        </div>
        <div className="dl-pick">
          <label>{tr("Local da missão", "Mission site")}
            <select className="field" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              {missions.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.body === "moon" ? tr("Lua", "Moon") : tr("Marte", "Mars")})</option>)}
            </select>
          </label>
          <label>{tr("Análogo na Terra", "Earth analog")}
            <select className="field" value={earthId ?? ""} onChange={(e) => setEarthId(e.target.value)}>
              {ranked.map((r, i) => <option key={r.s.id} value={r.s.id}>{i + 1}º · {r.s.name} (d = {fmt(r.d, 3)})</option>)}
            </select>
          </label>
        </div>
      </header>

      <div className="dl-layout">
        {/* ---------- roteiro ---------- */}
        <aside className="dl-steps card" aria-label={tr("Roteiro do experimento", "Experiment guide")}>
          <div className="dl-mode" role="radiogroup" aria-label={tr("Modo", "Mode")}>
            <button type="button" role="radio" aria-checked={!free} onClick={() => setFree(false)}>{tr("Guiado", "Guided")}</button>
            <button type="button" role="radio" aria-checked={free} onClick={() => setFree(true)}>{tr("Livre", "Free")}</button>
          </div>
          {!free && (
            <ol className="dl-list">
              {STEPS.map((s, i) => (
                <li key={s.id}><button type="button" aria-current={i === stepI ? "step" : undefined} onClick={() => setStepI(i)}><span>{i + 1}</span>{tr(...s.title)}</button></li>
              ))}
            </ol>
          )}
          <div className="dl-step">
            {!free && <><h2>{stepI + 1}. {tr(...step.title)}</h2><p>{tr(...step.what)}</p><p className="dl-look"><b>{tr("Observe", "Look")}:</b> {tr(...step.look)}</p></>}
            {free && <p>{tr("Todos os controles juntos. Combine resolução, ruído, lacunas e filtro e acompanhe o veredito.", "All controls together. Combine resolution, noise, gaps and filter and follow the verdict.")}</p>}

            {showCtl("res") && (
              <fieldset className="dl-ctl"><legend>{tr("Tamanho do pixel", "Pixel size")}</legend>
                <div className="dl-chips">{RES.map((r) => <button key={r} type="button" aria-pressed={opt.res === r} onClick={() => set("res", r)}>{r ? `${r} m` : `${tr("original", "original")} (${fmt(base?.r0 ?? 20, 0)} m)`}</button>)}</div>
              </fieldset>
            )}
            {showCtl("noise") && (
              <label className="dl-range"><span>{tr("Ruído vertical", "Vertical noise")} <b>±{opt.noise} m</b></span>
                <input type="range" min="0" max="20" step="1" value={opt.noise} onChange={(e) => set("noise", Number(e.target.value))} /></label>
            )}
            {showCtl("gaps") && (
              <label className="dl-range"><span>{tr("Área sem dado", "Area without data")} <b>{Math.round(opt.gaps * 100)}%</b></span>
                <input type="range" min="0" max="0.6" step="0.05" value={opt.gaps} onChange={(e) => set("gaps", Number(e.target.value))} /></label>
            )}
            {showCtl("smooth") && (
              <label className="dl-range"><span>{tr("Suavização", "Smoothing")} <b>{opt.smooth} px</b></span>
                <input type="range" min="0" max="6" step="1" value={opt.smooth} onChange={(e) => set("smooth", Number(e.target.value))} /></label>
            )}
            {!free && (
              <div className="dl-nav">
                <button type="button" disabled={stepI === 0} onClick={() => setStepI((i) => i - 1)}>← {tr("Anterior", "Back")}</button>
                <button type="button" className="gold" disabled={stepI === STEPS.length - 1} onClick={() => setStepI((i) => i + 1)}>{tr("Próximo", "Next")} →</button>
              </div>
            )}
            <button type="button" className="dl-reset" disabled={!changed} onClick={() => setOpt({ res: 0, noise: 0, gaps: 0, smooth: 0 })}>{tr("Voltar aos dados originais", "Back to original data")}</button>
          </div>
        </aside>

        {/* ---------- antes e depois ---------- */}
        <div className="dl-main">
          <div className="dl-views" role="radiogroup" aria-label={tr("O que mostrar", "What to show")}>
            {VIEWS.map((v) => <button key={v.id} type="button" role="radio" aria-checked={view === v.id} onClick={() => setView(v.id)} disabled={v.id === "imagem" && !scene?.color}>{tr(...v.label)}</button>)}
          </div>
          <div className="dl-pair">
            <figure className="dl-fig">
              <figcaption><b>Original</b> · {tr("dado real, pixel de", "real data, pixel")} {fmt(base?.r0 ?? 0, 0)} m</figcaption>
              {base && fields ? <Canvas field={fields.a.f} n={base.n} view={view} opts={fields.a.o} imageSrc={base.imageSrc} k={1} label={`Original: ${tr(...VIEWS.find((v) => v.id === view).label)} — ${earth?.name}`} /> : <div className="dl-canvas dl-wait">{tr("Carregando…", "Loading…")}</div>}
            </figure>
            <figure className="dl-fig">
              <figcaption><b>{tr("Processado", "Processed")}</b> {changed ? <span className="dl-sim">{tr("simulação", "simulation")}</span> : tr("· igual ao original", "· same as original")} {chain.length ? `· ${chain.join(" · ")}` : ""}</figcaption>
              {proc && fields ? <Canvas field={fields.b.f} n={proc.n} view={view} opts={fields.b.o} imageSrc={base.imageSrc} k={proc.k} valid={proc.valid} label={`${tr("Processado", "Processed")}: ${tr(...VIEWS.find((v) => v.id === view).label)}; ${chain.join(", ") || tr("sem alteração", "unchanged")}`} /> : <div className="dl-canvas dl-wait">…</div>}
            </figure>
          </div>
          <p className="dl-legend">
            {view === "declividade" && tr("Verde = plano · amarelo ≈ 15° · vermelho ≥ 35°. ", "Green = flat · yellow ≈ 15° · red ≥ 35°. ")}
            {view === "bordas" && tr(`Bordas fortes: ${fmt(fields?.edges.a * 100, 1)}% da célula no original → ${fmt(fields?.edges.b * 100, 1)}% no processado. `, `Strong edges: ${fmt(fields?.edges.a * 100, 1)}% of the cell in the original → ${fmt(fields?.edges.b * 100, 1)}% processed. `)}
            {view === "textura" && tr("Escuro = liso · claro = áspero (desvio-padrão local, 5 × 5 px). ", "Dark = smooth · bright = rough (local standard deviation, 5 × 5 px). ")}
            {view === "sombra" && tr("Luz vinda do noroeste a 45°. ", "Light from the northwest at 45°. ")}
            {tr("Xadrez = sem dado. Célula de 5 × 5 km de", "Checkered = no data. 5 × 5 km cell of")} {earth?.name}.
          </p>
          <div className="dl-a11y">
            {canSound() && sounds && <button type="button" onClick={listen}>🔊 {tr("Ouvir o relevo", "Listen to the terrain")}</button>}
            {canSpeak() && narration && <button type="button" onClick={() => speak(description, lang)}>🗣 {tr("Narrar o resultado", "Narrate the result")}</button>}
            <button type="button" onClick={() => { stopSound(); stopSpeaking(); }}>{tr("Parar", "Stop")}</button>
            <small>{tr("No som, agudo = alto, grave = baixo, chiado = terreno áspero e silêncio = lacuna.", "In the sound, high pitch = high ground, low pitch = low ground, hiss = rough terrain and silence = gap.")}</small>
          </div>
          <p className="sr-only" aria-live="polite">{description}</p>
        </div>

        {/* ---------- veredito ---------- */}
        <aside className="dl-verdict card" aria-label={tr("O que os dados sustentam", "What the data supports")}>
          <h2 className="eyebrow mb-2">{tr("O que os dados sustentam", "What the data supports")}</h2>
          {res && (
            <>
              <div className={`dl-big ${res.worst}`}>
                <span>{tr("Comparação", "Comparison")}</span><b>{WORD[res.worst]}</b>
                <small>{tr("distância ARA", "ARA distance")} {fmt(res.dO, 3)} → <b>{fmt(res.dP, 3)}</b> · {tr("cobertura", "coverage")} {fmt(res.pr.coverage * 100, 0)}% · {tr("medida a", "measured at")} {fmt(res.pr.res, 0)} m</small>
              </div>
              <table className="data-table dl-table">
                <thead><tr><th /><th>{site?.body === "moon" ? tr("Lua", "Moon") : tr("Marte", "Mars")}</th><th>Original</th><th>{tr("Processado", "Processed")}</th></tr></thead>
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
                    <b>{r.label}: {WORD[r.level]}.</b> {r.changed ? tr("A classificação mudou com o processamento. ", "The classification changed with processing. ") : ""}{r.reasons.length ? `${r.reasons.join("; ")}.` : tr("Resolução, cobertura e ruído compatíveis com a medida.", "Resolution, coverage and noise are compatible with the measure.")}
                  </li>
                ))}
              </ul>
              <h3 className="dl-h">{tr("O que continua incerto em qualquer caso", "What stays uncertain in any case")}</h3>
              <ul className="dl-unc">
                <li>{tr("Gravidade, pressão, temperatura e radiação — ver", "Gravity, pressure, temperature and radiation — see")} <Link to="/explorar">{tr("Pressão e temperatura", "Pressure and temperature")}</Link> {tr("no Explorar.", "in Explore.")}</li>
                <li>{tr("Mineralogia: litologia mapeada não é mineral verificado.", "Mineralogy: mapped lithology is not a verified mineral.")}</li>
                <li>{tr("Pedras menores que o pixel: nenhum DEM desta escala mostra (na Missão elas entram por modelo estatístico).", "Rocks smaller than the pixel: no DEM at this scale shows them (in Mission they come from a statistical model).")}</li>
                <li>{tr("DEMs da Terra e do planeta vêm de instrumentos diferentes (ex.: HiRISE ≈ 1 m, Kirk et al. 2008; SRTM ≈ 30 m).", "Earth and planet DEMs come from different instruments (e.g. HiRISE ≈ 1 m, Kirk et al. 2008; SRTM ≈ 30 m).")}</li>
              </ul>
            </>
          )}
          <details className="dl-src"><summary>{tr("Fontes e método", "Sources and method")}</summary>
            <p className="t3-note">{tr("Dados de partida: DEM e imagem reais da célula (AWS Terrain Tiles / Esri), recortados em 5 × 5 km. Degradações: média em blocos, ruído gaussiano, manchas sem dado e filtro de média móvel, todos com semente fixa, aplicados na grade do sensor. Medidas: as mesmas do ARA (blocos de 100 m). Regras do veredito: a medida perde sustentação se o pixel for maior que 100 m (declividade e rugosidade), se a cobertura cair abaixo de 80%, se o ruído for comparável à rugosidade real, ou se a classificação mudar.", "Starting data: the cell's real DEM and image (AWS Terrain Tiles / Esri), cropped to 5 × 5 km. Degradations: block averaging, Gaussian noise, no-data patches and moving-average filter, all with a fixed seed, applied on the sensor grid. Measures: the same as ARA (100 m blocks). Verdict rules: a measure loses support if the pixel is larger than 100 m (slope and roughness), coverage drops below 80%, noise is comparable to the real roughness, or the classification changes.")}</p>
            <ul>{SRC.map(([t, u]) => <li key={u}><a href={u} target="_blank" rel="noopener noreferrer">{t} ↗</a></li>)}</ul>
          </details>
        </aside>
      </div>
    </section>
  );
}
