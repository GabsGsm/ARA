// ARA Evidence Engine — evidências além do relevo, com regras explícitas e auditáveis.
// NÃO altera o ranking topográfico: só acrescenta cartões, o detector de falsos análogos (Analog Mirage),
// a próxima medição recomendada (Next Best Measurement) e a ficha exportável (Analog Passport).
//
// Cada evidência: { id, group, parameter, value, unit, relation, origin, source, url, resolution_m,
//                   period, method, rule, caveats[] }
//   relation: supporting | contradictory | unknown | not_applicable
//   origin:   observed | derived | model_estimate | contextual | simulated | unavailable
import * as core from "../core.js";

export const PURPOSES = {
  geomorfologia: { label: "Semelhança geomorfológica", short: "Geomorfologia",
    question: "Os parâmetros topográficos são compatíveis com o alvo?" },
  mobilidade: { label: "Ensaio de navegação de rover", short: "Rover",
    question: "Antes de testar um rover aqui, o que falta saber?" },
  instrumentacao: { label: "Teste de instrumento mineralógico", short: "Instrumento",
    question: "Que evidência geológica ou mineral justificaria um teste de instrumento aqui?" },
  treinamento: { label: "Treinamento de observação geológica", short: "Treinamento",
    question: "O que torna o local útil para treinar astronautas e geólogos?" },
};

export const RELATION = {
  supporting: { label: "Evidência favorável", tone: "ok" },
  contradictory: { label: "Diferença importante", tone: "bad" },
  unknown: { label: "Dado ausente ou inconclusivo", tone: "none" },
  not_applicable: { label: "Contexto (não decide)", tone: "info" },
};
export const ORIGIN = {
  observed: "Observado por sensor", derived: "Derivado de dados", model_estimate: "Estimativa de modelo",
  contextual: "Contexto regional", simulated: "Simulado", unavailable: "Indisponível",
};

// Rochas/ambientes que a literatura usa como análogos (palavras na litologia mapeada do Macrostrat)
const LITH_HINTS = {
  mars: { words: ["basalt", "volcanic", "lava", "lacustrine", "playa", "evaporite", "gypsum", "clay", "mudstone", "sandstone", "conglomerate", "fluvial", "alluvial", "delta"],
    why: "Jezero tem basalto/olivina, carbonatos, argilas e sedimentos de lago e delta." },
  moon: { words: ["basalt", "volcanic", "lava", "anorthosite", "breccia", "impact", "gabbro", "tuff", "cinder"],
    why: "O polo sul lunar tem anortositos, brechas de impacto e basaltos." },
};

const ev = (o) => ({ caveats: [], ...o });

/** Evidências de relevo (as do ranking), uma por medida. */
function topoEvidence(siteVec, cell, data, cellOrigin) {
  return core.RANK_ATTRS.map((a) => {
    const meta = data.config.attributes[a];
    const st = core.dimensionStatus(siteVec?.[a], cell?.[a], meta.scale, data.config.thresholds);
    return ev({
      id: `topo_${a}`, group: "Relevo", parameter: meta.label, value: cell?.[a], unit: meta.unit, target: siteVec?.[a],
      relation: st.status === "analog" || st.status === "partial" ? "supporting" : st.status === "not_analog" ? "contradictory" : "unknown",
      strength: st.status, origin: cellOrigin, source: data.grid?.dem ?? "Terrain Tiles", method: "Média na célula de 5 km a 100 m (mesma fórmula do ranking)",
      rule: `|diferença| / ${meta.scale} ${meta.unit} = ${st.diff == null ? "—" : st.diff.toFixed(2)}: análogo ≤ ${data.config.thresholds.good}, parcial ≤ ${data.config.thresholds.weak}.`,
    });
  });
}

function landcoverEvidence(lc, purpose) {
  if (!lc) return [ev({ id: "landcover", group: "Superfície", parameter: "Cobertura do solo", relation: "unknown", origin: "unavailable",
    source: "ESA WorldCover 2021", rule: "Sem dado de cobertura para este ponto (o WorldCover é pré-processado só para as células do catálogo)." })];
  const out = [];
  const veg = lc.vegetation_pct, bare = lc.bare_pct;
  out.push(ev({
    id: "landcover_bare", group: "Superfície", parameter: "Solo exposto / vegetação rala", value: bare, unit: "%", origin: "observed",
    source: "ESA WorldCover 2021 v200", resolution_m: 10, period: "2021",
    relation: bare >= 80 ? "supporting" : veg >= 30 ? "contradictory" : "unknown",
    rule: "≥ 80% de solo exposto = superfície observável como em Marte/Lua; ≥ 30% de vegetação = superfície coberta.",
    caveats: ["Solo exposto não significa regolito marciano ou lunar."],
  }));
  if (veg >= 5) out.push(ev({ id: "landcover_veg", group: "Superfície", parameter: "Vegetação", value: veg, unit: "%", origin: "observed", source: "ESA WorldCover 2021 v200",
    resolution_m: 10, relation: veg >= 30 || purpose === "instrumentacao" ? "contradictory" : "unknown", rule: "Vegetação esconde a superfície e interfere em espectrômetros." }));
  if ((lc.built_pct ?? 0) >= 2) out.push(ev({ id: "landcover_built", group: "Superfície", parameter: "Área construída", value: lc.built_pct, unit: "%", origin: "observed",
    source: "ESA WorldCover 2021 v200", resolution_m: 10, relation: "contradictory", rule: "Estruturas humanas interferem em testes e na paisagem." }));
  return out;
}

function waterEvidence(wa, purpose) {
  if (!wa) return [ev({ id: "water", group: "Estabilidade", parameter: "Histórico de água superficial", relation: "unknown", origin: "unavailable", source: "JRC Global Surface Water",
    rule: "Sem dado válido do JRC para a célula." })];
  const wet = wa.frequent_water_pct >= 1 || wa.any_water_pct >= 5;
  return [ev({
    id: "water", group: "Estabilidade", parameter: "Área com água detectada (1984–2021)", value: wa.any_water_pct, unit: "%", origin: "observed",
    source: "JRC Global Surface Water v1.4", resolution_m: 30, period: "1984–2021",
    relation: wet ? (purpose === "geomorfologia" ? "unknown" : "contradictory") : "supporting",
    rule: "≥ 5% da área já teve água, ou ≥ 1% tem água em metade das observações = superfície que muda com inundações.",
    caveats: ["Não cobre depois de 2021 nem umidade do solo; ausência de detecção não prova ausência de água."],
  })];
}

function soilEvidence(so, purpose) {
  if (!so) return [ev({ id: "soil", group: "Solo", parameter: "Textura e fragmentos do solo", relation: "unknown", origin: "unavailable", source: "ISRIC SoilGrids 2.0",
    rule: "SoilGrids sem predição válida aqui (comum em afloramentos rochosos e desertos extremos)." })];
  const p = so.properties;
  const txt = ["sand", "silt", "clay"].filter((k) => p[k]).map((k) => `${p[k].name.toLowerCase()} ${p[k].mean}%`).join(", ");
  return [ev({
    id: "soil", group: "Solo", parameter: "Textura do solo 0–5 cm", value: txt, origin: "model_estimate", source: "ISRIC SoilGrids 2.0", resolution_m: 250,
    relation: "not_applicable",
    rule: purpose === "mobilidade" ? "Textura ajuda a escolher onde ensaiar, mas tração, afundamento e coesão só se medem em campo." : "Contexto do material superficial; não entra na decisão.",
    detail: Object.values(p).map((x) => `${x.name}: ${x.mean} ${x.unit} (${x.q05 ?? "—"}–${x.q95 ?? "—"})`),
    caveats: ["Predição de modelo, não amostra; q05–q95 = incerteza.", "Não converter em tração ou capacidade de suporte."],
  })];
}

function climateEvidence(cl, purpose) {
  const P = cl?.params?.PRECTOTCORR?.annual, T = cl?.params?.T2M?.annual;
  if (P == null) return [ev({ id: "climate", group: "Ambiente", parameter: "Aridez (chuva anual)", relation: "unknown", origin: "unavailable", source: "NASA POWER" })];
  const mmYear = P * 365.25;
  return [ev({
    id: "climate", group: "Ambiente", parameter: "Chuva média anual", value: Math.round(mmYear), unit: "mm/ano", origin: "contextual", source: "NASA POWER (MERRA-2)",
    resolution_m: 55000, period: cl.period,
    relation: mmYear < 250 ? "supporting" : mmYear > 600 && purpose !== "geomorfologia" ? "contradictory" : "unknown",
    rule: "< 250 mm/ano = árido (superfície seca como em Marte/Lua); > 600 mm/ano = intemperismo e vegetação ativos.",
    detail: [`Temperatura média ${T?.toFixed(1)} °C`, `Radiação solar ${cl.params.ALLSKY_SFC_SW_DWN?.annual?.toFixed(2)} kWh/m²/dia`],
    caveats: ["Média regional de longo prazo (~0,5°), não medição da célula nem do dia."],
  })];
}

function geologyEvidence(geo, body, purpose) {
  if (!geo) return [ev({ id: "geology", group: "Geologia", parameter: "Unidade geológica", relation: "unknown", origin: "unavailable", source: "Macrostrat",
    rule: "Sem unidade mapeada pelo Macrostrat neste ponto." })];
  const hint = LITH_HINTS[body] ?? LITH_HINTS.mars;
  const text = `${geo.name ?? ""} ${geo.lith ?? ""} ${geo.descrip ?? ""}`.toLowerCase();
  const hits = hint.words.filter((w) => text.includes(w));
  return [ev({
    id: "geology", group: "Geologia", parameter: "Unidade mapeada", value: geo.name, origin: "contextual", source: "Macrostrat (API v2)",
    relation: hits.length ? "supporting" : purpose === "instrumentacao" ? "unknown" : "not_applicable",
    rule: hits.length ? `Litologia menciona ${hits.join(", ")} — ${hint.why}` : `Nenhuma palavra-chave de análogo na litologia. ${hint.why}`,
    detail: [geo.lith && `Litologia: ${geo.lith}`, geo.age?.best && `Idade: ${geo.age.best}${geo.age.b_ma ? ` (${geo.age.t_ma}–${geo.age.b_ma} Ma)` : ""}`, geo.scale && `Escala do mapa: ${geo.scale}`].filter(Boolean),
    caveats: ["Litologia mapeada não é identificação mineral."],
  })];
}

function mineralEvidence() {
  return [ev({ id: "mineral_earth", group: "Mineralogia", parameter: "Mineralogia observada na Terra", relation: "unknown", origin: "unavailable", source: "NASA EMIT (L2B)",
    rule: "Mapa mineral por espectroscopia (EMIT) ainda não integrado para esta célula; ausência de observação não é ausência de mineral." })];
}

/** Evidências do alvo planetário (dados entregues pelo time). */
export function targetEvidence(siteAttrs, body) {
  const out = [];
  const th = siteAttrs?.thermal;
  if (th?.property === "thermal_inertia") {
    out.push(ev({ id: "t_ti", group: "Alvo", parameter: "Inércia térmica (THEMIS 2026)", value: Math.round(th.thermal_inertia_median), unit: "J m⁻² K⁻¹ s⁻½", origin: "derived",
      source: th.source, resolution_m: th.source_resolution_m, relation: "not_applicable",
      rule: "Relacionada a granulometria e coesão da superfície, mas não é medida direta delas; sem equivalente terrestre harmonizado.",
      caveats: ["Produto de 2026 descrito como submetido para publicação.", `Nível absoluto incerto em ~12–24%.`] }));
    const bt = th.brightness_temperature;
    if (bt) out.push(ev({ id: "t_bt", group: "Alvo", parameter: "Temperatura de brilho (THEMIS)", value: Math.round(bt.temperature_median_k), unit: "K", origin: "observed",
      source: `${bt.instrument} ${bt.product_id}`, resolution_m: bt.source_resolution_m, period: bt.observation_start_utc?.slice(0, 10), relation: "not_applicable",
      rule: "Uma observação noturna; não é média anual nem temperatura do ar.", caveats: [`Cobertura ${bt.coverage_pct}% do recorte.`] }));
  } else if (th?.type === "modeled_annual_surface_temperature") {
    out.push(ev({ id: "t_div", group: "Alvo", parameter: "Temperatura média anual (Diviner)", value: Math.round(th.temp_mean_annual_k), unit: "K", origin: "model_estimate",
      source: `${th.source} ${th.product}`, relation: "not_applicable", rule: "Temperatura modelada da superfície lunar; nenhum lugar da Terra chega perto.",
      detail: [`Máxima média ${Math.round(th.temp_max_annual_mean_k)} K`, `Mínima média ${Math.round(th.temp_mean_annual_lowest_k)} K`] }));
  }
  const mi = siteAttrs?.mineralogy;
  if (mi?.source === "CRISM") out.push(ev({ id: "t_crism", group: "Alvo", parameter: "Minerais mapeados (CRISM)", value: (mi.classes ?? []).join(", ") || "—", origin: "observed",
    source: "Valantinas et al. 2026 (CRISM + CaSSIS)", resolution_m: 18, relation: "not_applicable", rule: `${Math.round(mi.coverage_pct)}% do recorte tem mapa mineral.`, caveats: [mi.note] }));
  else if (mi?.source) out.push(ev({ id: "t_m3", group: "Alvo", parameter: "Espectroscopia (M3)", value: mi.summary ?? mi.status, origin: mi.exploratory_pixels ? "observed" : "unavailable",
    source: mi.source, relation: "not_applicable", rule: "Indicadores espectrais exploratórios; classificação mineral não validada." }));
  out.push(ev({ id: "t_g", group: "Alvo", parameter: "Gravidade", value: body === "moon" ? 1.62 : 3.72, unit: "m/s²", origin: "observed", source: "NASA Planetary Fact Sheet",
    relation: "contradictory", rule: "Nenhum lugar da Terra reproduz a gravidade (9,81 m/s²): mobilidade e poeira mudam." }));
  return out;
}

/** Todas as evidências de um candidato para uma finalidade. */
export function evidenceFor({ siteVec, cell, extra, body, purpose, data, origin = "derived" }) {
  return [
    ...topoEvidence(siteVec, cell, data, origin),
    ...landcoverEvidence(extra?.landcover, purpose),
    ...waterEvidence(extra?.water, purpose),
    ...soilEvidence(extra?.soil, purpose),
    ...climateEvidence(extra?.climate, purpose),
    ...geologyEvidence(extra?.geology, body, purpose),
    ...mineralEvidence(),
  ];
}

export function tally(list) {
  const t = { supporting: 0, contradictory: 0, unknown: 0, not_applicable: 0 };
  list.forEach((e) => { t[e.relation] += 1; });
  return t;
}

/** Analog Mirage: relevo parecido, mas evidências fora do ranking contradizem a finalidade. */
export function mirage(list) {
  const topo = list.filter((e) => e.group === "Relevo");
  const other = list.filter((e) => e.group !== "Relevo");
  const topoGood = topo.every((e) => e.relation === "supporting");
  const against = other.filter((e) => e.relation === "contradictory");
  const unknown = other.filter((e) => e.relation === "unknown");
  let verdict = "consistent";
  if (topoGood && against.length) verdict = "mirage";
  else if (!topoGood) verdict = "topo_differs";
  else if (unknown.length >= 3) verdict = "undetermined";
  return { verdict, topoGood, against, unknown };
}

// ---- Next Best Measurement: matriz finalidade × evidência necessária (regras da equipe, editáveis aqui)
const NEEDS = {
  geomorfologia: [
    { attr: "topo", ids: ["topo_slope_mean_deg", "topo_roughness_mean_m", "topo_relief_m"], criticality: "essential", measure: "Já medido no ranking (DEM 100 m)." },
    { attr: "escala", ids: [], criticality: "useful", measure: "Perfil topográfico de alta resolução (lidar ou DEM de drone) para textura < 100 m.", decision: "Confirma se a rugosidade fina também é parecida." },
    { attr: "superfície", ids: ["landcover_bare"], criticality: "useful", measure: "Inspeção de imagem de alta resolução ou visita de campo.", decision: "Se a forma está exposta ou coberta." },
  ],
  mobilidade: [
    { attr: "topo", ids: ["topo_slope_mean_deg", "topo_roughness_mean_m"], criticality: "essential", measure: "Já medido (declividade e rugosidade a 100 m)." },
    { attr: "superfície exposta", ids: ["landcover_bare"], criticality: "essential", measure: "Verificar em campo se a rota de teste é solo exposto.", decision: "Se dá para testar sem vegetação no caminho." },
    { attr: "estabilidade", ids: ["water"], criticality: "useful", measure: "Checar histórico de inundação e época seca.", decision: "Quando o terreno fica estável para o ensaio." },
    { attr: "material", ids: ["soil"], criticality: "essential", measure: "Coleta de amostra + granulometria e ensaio de resistência (penetrômetro, bevameter).", decision: "Tração, afundamento e slip do rover — o SoilGrids não responde isso." },
    { attr: "blocos", ids: [], criticality: "essential", measure: "Contagem de blocos por imagem < 0,5 m ou drone.", decision: "Obstáculos para as rodas." },
  ],
  instrumentacao: [
    { attr: "geologia", ids: ["geology"], criticality: "essential", measure: "Mapa geológico de detalhe e visita de campo.", decision: "Se a rocha é do tipo certo para o instrumento." },
    { attr: "mineralogia", ids: ["mineral_earth"], criticality: "essential", measure: "Espectroscopia (EMIT/AVIRIS) e análise de amostras em laboratório (DRX, VNIR/SWIR).", decision: "Quais minerais o instrumento vai encontrar." },
    { attr: "superfície exposta", ids: ["landcover_bare"], criticality: "essential", measure: "Confirmar afloramento sem vegetação.", decision: "Se o sensor enxerga a rocha." },
    { attr: "clima", ids: ["climate"], criticality: "useful", measure: "Escolher época seca (climatologia).", decision: "Umidade altera as bandas de água nos espectros." },
  ],
  treinamento: [
    { attr: "geologia", ids: ["geology"], criticality: "essential", measure: "Documentação geológica publicada da área.", decision: "O que os treinandos vão observar." },
    { attr: "topo", ids: ["topo_relief_m"], criticality: "useful", measure: "Já medido (amplitude do relevo).", decision: "Visibilidade de afloramentos e camadas." },
    { attr: "acesso", ids: [], criticality: "essential", measure: "Verificar acesso, segurança e permissões (unidade de conservação, propriedade).", decision: "Se dá para levar uma equipe." },
    { attr: "clima", ids: ["climate"], criticality: "useful", measure: "Escolher época do ano (temperatura e chuva).", decision: "Segurança e conforto da equipe." },
  ],
};

/** Divide o que sabemos, o que falta verificar e o próximo ensaio recomendado. */
export function nextBest(list, purpose) {
  const byId = Object.fromEntries(list.map((e) => [e.id, e]));
  const known = [], missing = [];
  for (const n of NEEDS[purpose] ?? []) {
    const items = n.ids.map((id) => byId[id]).filter(Boolean);
    const solid = items.length && items.every((e) => ["observed", "derived"].includes(e.origin) && e.relation !== "unknown");
    (solid ? known : missing).push({ ...n, items });
  }
  const order = { essential: 0, useful: 1, optional: 2 };
  missing.sort((a, b) => order[a.criticality] - order[b.criticality]);
  return { known, missing, next: missing[0] ?? null };
}

/** Ficha exportável do candidato (JSON). */
export function passport({ candidate, site, purpose, objective, weights, list, distance, rankInfo, data, sourcesMeta }) {
  const t = tally(list);
  const m = mirage(list);
  const nb = nextBest(list, purpose);
  return {
    app: "ARA — Analog Research & Analysis", format: "Analog Passport v1", generated_utc: new Date().toISOString(),
    identification: { name: candidate.name, id: candidate.id, latitude: candidate.lat, longitude: candidate.lon, area: "5 × 5 km", origin: candidate.origin },
    target: { body: site.body, id: site.id, name: site.name, purpose: PURPOSES[purpose].label, objective, weights: core.normalizeWeights(weights) },
    characterization: { terrain: Object.fromEntries(core.RANK_ATTRS.map((a) => [a, candidate[a]])), distance, rank: rankInfo, evidence: list },
    interpretation: {
      supporting: list.filter((e) => e.relation === "supporting").map((e) => e.parameter),
      contradictory: list.filter((e) => e.relation === "contradictory").map((e) => e.parameter),
      unknown: list.filter((e) => e.relation === "unknown").map((e) => e.parameter),
      analog_mirage: m.verdict, counts: t,
      next_best_measurement: nb.next ? { what: nb.next.measure, why: nb.next.decision, criticality: nb.next.criticality } : null,
    },
    provenance: { ranking: { method: "d = sqrt(Σ wᵢ ((siteᵢ − cellᵢ)/scaleᵢ)²)", scales: data.scales, thresholds: data.config.thresholds }, datasets: sourcesMeta, run_ids: data.grid.run_ids },
    conclusion: {
      text: m.verdict === "mirage" ? "Relevo parecido, mas há evidências contrárias para esta finalidade: possível falso análogo."
        : m.verdict === "topo_differs" ? "O relevo já difere do alvo em pelo menos uma medida." : m.verdict === "undetermined" ? "Relevo parecido; faltam dados para decidir."
        : "Relevo parecido e sem evidência contrária nos dados disponíveis.",
      limitations: ["Comparação de relevo não estabelece equivalência geológica, mineral, atmosférica ou mecânica.", "Gravidade, atmosfera e radiação não são reproduzíveis na Terra."],
      needs_validation: nb.missing.map((x) => x.measure),
    },
  };
}

export function downloadJSON(obj, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
