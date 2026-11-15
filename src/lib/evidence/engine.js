// ARA Evidence Engine — evidências além do relevo, com regras explícitas e auditáveis.
// NÃO altera o ranking topográfico: só acrescenta cartões, o detector de falsos análogos (Analog Mirage),
// a próxima medição recomendada (Next Best Measurement) e a ficha exportável (Analog Passport).
//
// Cada evidência: { id, group, parameter, value, unit, relation, origin, source, url, resolution_m,
//                   period, method, rule, caveats[] }
//   relation: supporting | contradictory | unknown | not_applicable
//   origin:   observed | derived | model_estimate | contextual | simulated | unavailable
import * as core from "../core.js";
import { T } from "../i18n.js";

const PURPOSES_SRC = {
  geomorfologia: { label: ["Semelhança geomorfológica", "Geomorphological similarity"], short: ["Geomorfologia", "Geomorphology"],
    question: ["Os parâmetros topográficos são compatíveis com o alvo?", "Are the topographic parameters compatible with the target?"] },
  mobilidade: { label: ["Ensaio de navegação de rover", "Rover navigation test"], short: ["Rover", "Rover"],
    question: ["Antes de testar um rover aqui, o que falta saber?", "Before testing a rover here, what do we still need to know?"] },
  instrumentacao: { label: ["Teste de instrumento mineralógico", "Mineralogical instrument test"], short: ["Instrumento", "Instrument"],
    question: ["Que evidência geológica ou mineral justificaria um teste de instrumento aqui?", "What geological or mineral evidence would justify an instrument test here?"] },
  treinamento: { label: ["Treinamento de observação geológica", "Geological observation training"], short: ["Treinamento", "Training"],
    question: ["O que torna o local útil para treinar astronautas e geólogos?", "What makes the site useful for training astronauts and geologists?"] },
};
const tx = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, Array.isArray(v) ? T(v[0], v[1]) : v && typeof v === "object" ? tx(v) : v]));
/** Rótulos no idioma atual (objetos recalculados a cada leitura). */
export const PURPOSES = new Proxy({}, { get: (_, k) => (PURPOSES_SRC[k] ? tx(PURPOSES_SRC[k]) : undefined), ownKeys: () => Reflect.ownKeys(PURPOSES_SRC),
  getOwnPropertyDescriptor: (_, k) => ({ enumerable: true, configurable: true, value: PURPOSES_SRC[k] && tx(PURPOSES_SRC[k]) }) });

const RELATION_SRC = {
  supporting: { label: ["Evidência favorável", "Supporting evidence"], tone: "ok" },
  contradictory: { label: ["Diferença importante", "Important difference"], tone: "bad" },
  unknown: { label: ["Dado ausente ou inconclusivo", "Missing or inconclusive data"], tone: "none" },
  not_applicable: { label: ["Contexto (não decide)", "Context (not decisive)"], tone: "info" },
};
export const RELATION = new Proxy({}, { get: (_, k) => (RELATION_SRC[k] ? tx(RELATION_SRC[k]) : undefined), ownKeys: () => Reflect.ownKeys(RELATION_SRC),
  getOwnPropertyDescriptor: (_, k) => ({ enumerable: true, configurable: true, value: RELATION_SRC[k] && tx(RELATION_SRC[k]) }) });
const ORIGIN_SRC = {
  observed: ["Observado por sensor", "Observed by a sensor"], derived: ["Derivado de dados", "Derived from data"], model_estimate: ["Estimativa de modelo", "Model estimate"],
  contextual: ["Contexto regional", "Regional context"], simulated: ["Simulado", "Simulated"], unavailable: ["Indisponível", "Unavailable"],
};
export const ORIGIN = new Proxy({}, { get: (_, k) => (ORIGIN_SRC[k] ? T(...ORIGIN_SRC[k]) : undefined), ownKeys: () => Reflect.ownKeys(ORIGIN_SRC),
  getOwnPropertyDescriptor: (_, k) => ({ enumerable: true, configurable: true, value: ORIGIN_SRC[k] && T(...ORIGIN_SRC[k]) }) });

// Rochas/ambientes que a literatura usa como análogos (palavras na litologia mapeada do Macrostrat)
const LITH_HINTS = {
  mars: { words: ["basalt", "volcanic", "lava", "lacustrine", "playa", "evaporite", "gypsum", "clay", "mudstone", "sandstone", "conglomerate", "fluvial", "alluvial", "delta"],
    why: () => T("Jezero tem basalto/olivina, carbonatos, argilas e sedimentos de lago e delta.", "Jezero has basalt/olivine, carbonates, clays and lake and delta sediments.") },
  moon: { words: ["basalt", "volcanic", "lava", "anorthosite", "breccia", "impact", "gabbro", "tuff", "cinder"],
    why: () => T("O polo sul lunar tem anortositos, brechas de impacto e basaltos.", "The lunar south pole has anorthosites, impact breccias and basalts.") },
};

const ev = (o) => ({ caveats: [], ...o });

/** Evidências de relevo (as do ranking), uma por medida. */
function topoEvidence(siteVec, cell, data, cellOrigin) {
  return core.RANK_ATTRS.map((a) => {
    const meta = data.config.attributes[a];
    const st = core.dimensionStatus(siteVec?.[a], cell?.[a], meta.scale, data.config.thresholds);
    return ev({
      id: `topo_${a}`, group: T("Relevo", "Relief"), groupKey: "Relevo", parameter: T(meta.label), value: cell?.[a], unit: meta.unit, target: siteVec?.[a],
      relation: st.status === "analog" || st.status === "partial" ? "supporting" : st.status === "not_analog" ? "contradictory" : "unknown",
      strength: st.status, origin: cellOrigin, source: data.grid?.dem ?? "Terrain Tiles", method: T("Média na célula de 5 km a 100 m (mesma fórmula do ranking)", "Mean over the 5 km cell at 100 m (same formula as the ranking)"),
      rule: T(`|diferença| / ${meta.scale} ${meta.unit} = ${st.diff == null ? "—" : st.diff.toFixed(2)}: análogo ≤ ${data.config.thresholds.good}, parcial ≤ ${data.config.thresholds.weak}.`, `|difference| / ${meta.scale} ${meta.unit} = ${st.diff == null ? "—" : st.diff.toFixed(2)}: analog ≤ ${data.config.thresholds.good}, partial ≤ ${data.config.thresholds.weak}.`),
    });
  });
}

function landcoverEvidence(lc, purpose) {
  if (!lc) return [ev({ id: "landcover", group: T("Superfície", "Surface"), parameter: T("Cobertura do solo", "Land cover"), relation: "unknown", origin: "unavailable",
    source: "ESA WorldCover 2021", rule: T("Sem dado de cobertura para este ponto (o WorldCover é pré-processado só para as células do catálogo).", "No land-cover data for this point (WorldCover is pre-processed only for catalogue cells).") })];
  const out = [];
  const veg = lc.vegetation_pct, bare = lc.bare_pct;
  out.push(ev({
    id: "landcover_bare", group: T("Superfície", "Surface"), parameter: T("Solo exposto / vegetação rala", "Bare ground / sparse vegetation"), value: bare, unit: "%", origin: "observed",
    source: "ESA WorldCover 2021 v200", resolution_m: 10, period: "2021",
    relation: bare >= 80 ? "supporting" : veg >= 30 ? "contradictory" : "unknown",
    rule: T("≥ 80% de solo exposto = superfície observável como em Marte/Lua; ≥ 30% de vegetação = superfície coberta.", "≥ 80% bare ground = surface observable as on Mars/Moon; ≥ 30% vegetation = covered surface."),
    caveats: [T("Solo exposto não significa regolito marciano ou lunar.", "Bare ground does not mean Martian or lunar regolith.")],
  }));
  if (veg >= 5) out.push(ev({ id: "landcover_veg", group: T("Superfície", "Surface"), parameter: T("Vegetação", "Vegetation"), value: veg, unit: "%", origin: "observed", source: "ESA WorldCover 2021 v200",
    resolution_m: 10, relation: veg >= 30 || purpose === "instrumentacao" ? "contradictory" : "unknown", rule: T("Vegetação esconde a superfície e interfere em espectrômetros.", "Vegetation hides the surface and interferes with spectrometers.") }));
  if ((lc.built_pct ?? 0) >= 2) out.push(ev({ id: "landcover_built", group: T("Superfície", "Surface"), parameter: T("Área construída", "Built-up area"), value: lc.built_pct, unit: "%", origin: "observed",
    source: "ESA WorldCover 2021 v200", resolution_m: 10, relation: "contradictory", rule: T("Estruturas humanas interferem em testes e na paisagem.", "Human structures interfere with tests and with the landscape.") }));
  return out;
}

function waterEvidence(wa, purpose) {
  if (!wa) return [ev({ id: "water", group: T("Estabilidade", "Stability"), parameter: T("Histórico de água superficial", "Surface water history"), relation: "unknown", origin: "unavailable", source: "JRC Global Surface Water",
    rule: T("Sem dado válido do JRC para a célula.", "No valid JRC data for the cell.") })];
  const wet = wa.frequent_water_pct >= 1 || wa.any_water_pct >= 5;
  return [ev({
    id: "water", group: T("Estabilidade", "Stability"), parameter: T("Área com água detectada (1984–2021)", "Area with water detected (1984–2021)"), value: wa.any_water_pct, unit: "%", origin: "observed",
    source: "JRC Global Surface Water v1.4", resolution_m: 30, period: "1984–2021",
    relation: wet ? (purpose === "geomorfologia" ? "unknown" : "contradictory") : "supporting",
    rule: T("≥ 5% da área já teve água, ou ≥ 1% tem água em metade das observações = superfície que muda com inundações.", "≥ 5% of the area has had water, or ≥ 1% has water in half of the observations = a surface reshaped by floods."),
    caveats: [T("Não cobre depois de 2021 nem umidade do solo; ausência de detecção não prova ausência de água.", "Does not cover after 2021 or soil moisture; not detecting water does not prove there is none.")],
  })];
}

function soilEvidence(so, purpose) {
  if (!so) return [ev({ id: "soil", group: T("Solo", "Soil"), parameter: T("Textura e fragmentos do solo", "Soil texture and fragments"), relation: "unknown", origin: "unavailable", source: "ISRIC SoilGrids 2.0",
    rule: T("SoilGrids sem predição válida aqui (comum em afloramentos rochosos e desertos extremos).", "No valid SoilGrids prediction here (common on rock outcrops and in extreme deserts).") })];
  const p = so.properties;
  const SOILN = { sand: T("areia", "sand"), silt: T("silte", "silt"), clay: T("argila", "clay"), cfvo: T("Fragmentos grossos", "Coarse fragments"), bdod: T("Densidade aparente", "Bulk density") };
  const txt = ["sand", "silt", "clay"].filter((k) => p[k]).map((k) => `${SOILN[k]} ${p[k].mean}%`).join(", ");
  return [ev({
    id: "soil", group: T("Solo", "Soil"), parameter: T("Textura do solo 0–5 cm", "Soil texture 0–5 cm"), value: txt, origin: "model_estimate", source: "ISRIC SoilGrids 2.0", resolution_m: 250,
    relation: "not_applicable",
    rule: purpose === "mobilidade" ? T("Textura ajuda a escolher onde ensaiar, mas tração, afundamento e coesão só se medem em campo.", "Texture helps choose where to test, but traction, sinkage and cohesion can only be measured in the field.") : T("Contexto do material superficial; não entra na decisão.", "Context on the surface material; it does not enter the decision."),
    detail: Object.entries(p).map(([k, x]) => `${SOILN[k] ?? x.name}: ${x.mean} ${x.unit} (${x.q05 ?? "—"}–${x.q95 ?? "—"})`),
    caveats: [T("Predição de modelo, não amostra; q05–q95 = incerteza.", "Model prediction, not a sample; q05–q95 = uncertainty."), T("Não converter em tração ou capacidade de suporte.", "Do not convert into traction or bearing capacity.")],
  })];
}

function climateEvidence(cl, purpose) {
  const P = cl?.params?.PRECTOTCORR?.annual, Tm = cl?.params?.T2M?.annual;
  if (P == null) return [ev({ id: "climate", group: T("Ambiente", "Environment"), parameter: T("Aridez (chuva anual)", "Aridity (annual rainfall)"), relation: "unknown", origin: "unavailable", source: "NASA POWER" })];
  const mmYear = P * 365.25;
  return [ev({
    id: "climate", group: T("Ambiente", "Environment"), parameter: T("Chuva média anual", "Mean annual rainfall"), value: Math.round(mmYear), unit: T("mm/ano", "mm/yr"), origin: "contextual", source: "NASA POWER (MERRA-2)",
    resolution_m: 55000, period: cl.period,
    relation: mmYear < 250 ? "supporting" : mmYear > 600 && purpose !== "geomorfologia" ? "contradictory" : "unknown",
    rule: T("< 250 mm/ano = árido (superfície seca como em Marte/Lua); > 600 mm/ano = intemperismo e vegetação ativos.", "< 250 mm/yr = arid (dry surface as on Mars/Moon); > 600 mm/yr = active weathering and vegetation."),
    detail: [`${T("Temperatura média", "Mean temperature")} ${Tm?.toFixed(1)} °C`, `${T("Radiação solar", "Solar radiation")} ${cl.params.ALLSKY_SFC_SW_DWN?.annual?.toFixed(2)} ${T("kWh/m²/dia", "kWh/m²/day")}`],
    caveats: [T("Média regional de longo prazo (~0,5°), não medição da célula nem do dia.", "Long-term regional mean (~0.5°), not a measurement of the cell or of the day.")],
  })];
}

function geologyEvidence(geo, body, purpose) {
  if (!geo) return [ev({ id: "geology", group: T("Geologia", "Geology"), parameter: T("Unidade geológica", "Geological unit"), relation: "unknown", origin: "unavailable", source: "Macrostrat",
    rule: T("Sem unidade mapeada pelo Macrostrat neste ponto.", "No unit mapped by Macrostrat at this point.") })];
  const hint = LITH_HINTS[body] ?? LITH_HINTS.mars;
  const text = `${geo.name ?? ""} ${geo.lith ?? ""} ${geo.descrip ?? ""}`.toLowerCase();
  const hits = hint.words.filter((w) => text.includes(w));
  return [ev({
    id: "geology", group: T("Geologia", "Geology"), parameter: T("Unidade mapeada", "Mapped unit"), value: geo.name, origin: "contextual", source: "Macrostrat (API v2)",
    relation: hits.length ? "supporting" : purpose === "instrumentacao" ? "unknown" : "not_applicable",
    rule: hits.length ? `${T("Litologia menciona", "Lithology mentions")} ${hits.join(", ")} — ${hint.why()}` : `${T("Nenhuma palavra-chave de análogo na litologia.", "No analog keyword in the lithology.")} ${hint.why()}`,
    detail: [geo.lith && `${T("Litologia", "Lithology")}: ${geo.lith}`, geo.age?.best && `${T("Idade", "Age")}: ${geo.age.best}${geo.age.b_ma ? ` (${geo.age.t_ma}–${geo.age.b_ma} Ma)` : ""}`, geo.scale && `${T("Escala do mapa", "Map scale")}: ${geo.scale}`].filter(Boolean),
    caveats: [T("Litologia mapeada não é identificação mineral.", "Mapped lithology is not a mineral identification.")],
  })];
}

function mineralEvidence() {
  return [ev({ id: "mineral_earth", group: T("Mineralogia", "Mineralogy"), parameter: T("Mineralogia observada na Terra", "Mineralogy observed on Earth"), relation: "unknown", origin: "unavailable", source: "NASA EMIT (L2B)",
    rule: T("Mapa mineral por espectroscopia (EMIT) ainda não integrado para esta célula; ausência de observação não é ausência de mineral.", "A spectroscopic mineral map (EMIT) is not yet integrated for this cell; no observation is not the same as no mineral.") })];
}

/** Evidências do alvo planetário (dados entregues pelo time). */
export function targetEvidence(siteAttrs, body) {
  const out = [];
  const th = siteAttrs?.thermal;
  if (th?.property === "thermal_inertia") {
    out.push(ev({ id: "t_ti", group: T("Alvo", "Target"), parameter: T("Inércia térmica (THEMIS 2026)", "Thermal inertia (THEMIS 2026)"), value: Math.round(th.thermal_inertia_median), unit: "J m⁻² K⁻¹ s⁻½", origin: "derived",
      source: th.source, resolution_m: th.source_resolution_m, relation: "not_applicable",
      rule: T("Relacionada a granulometria e coesão da superfície, mas não é medida direta delas; sem equivalente terrestre harmonizado.", "Related to grain size and surface cohesion, but not a direct measure of them; no harmonised Earth equivalent."),
      caveats: [T("Produto de 2026 descrito como submetido para publicação.", "2026 product described as submitted for publication."), T("Nível absoluto incerto em ~12–24%.", "Absolute level uncertain by ~12–24%.")] }));
    const bt = th.brightness_temperature;
    if (bt) out.push(ev({ id: "t_bt", group: T("Alvo", "Target"), parameter: T("Temperatura de brilho (THEMIS)", "Brightness temperature (THEMIS)"), value: Math.round(bt.temperature_median_k), unit: "K", origin: "observed",
      source: `${bt.instrument} ${bt.product_id}`, resolution_m: bt.source_resolution_m, period: bt.observation_start_utc?.slice(0, 10), relation: "not_applicable",
      rule: T("Uma observação noturna; não é média anual nem temperatura do ar.", "A single night-time observation; not an annual mean nor air temperature."), caveats: [`${T("Cobertura", "Coverage")} ${bt.coverage_pct}% ${T("do recorte", "of the site")}.`] }));
  } else if (th?.type === "modeled_annual_surface_temperature") {
    out.push(ev({ id: "t_div", group: T("Alvo", "Target"), parameter: T("Temperatura média anual (Diviner)", "Mean annual temperature (Diviner)"), value: Math.round(th.temp_mean_annual_k), unit: "K", origin: "model_estimate",
      source: `${th.source} ${th.product}`, relation: "not_applicable", rule: T("Temperatura modelada da superfície lunar; nenhum lugar da Terra chega perto.", "Modelled lunar surface temperature; nowhere on Earth comes close."),
      detail: [`${T("Máxima média", "Mean maximum")} ${Math.round(th.temp_max_annual_mean_k)} K`, `${T("Mínima média", "Mean minimum")} ${Math.round(th.temp_mean_annual_lowest_k)} K`] }));
  }
  const mi = siteAttrs?.mineralogy;
  if (mi?.source === "CRISM") out.push(ev({ id: "t_crism", group: T("Alvo", "Target"), parameter: T("Minerais mapeados (CRISM)", "Mapped minerals (CRISM)"), value: (mi.classes ?? []).join(", ") || "—", origin: "observed",
    source: "Valantinas et al. 2026 (CRISM + CaSSIS)", resolution_m: 18, relation: "not_applicable", rule: T(`${Math.round(mi.coverage_pct)}% do recorte tem mapa mineral.`, `${Math.round(mi.coverage_pct)}% of the site has a mineral map.`), caveats: [T(mi.note, "Classes by the dominant absorber in the CRISM spectra; weak/strong refers to the 1 µm band, not abundance.")] }));
  else if (mi?.source) out.push(ev({ id: "t_m3", group: T("Alvo", "Target"), parameter: T("Espectroscopia (M3)", "Spectroscopy (M3)"), value: mi.summary ?? mi.status, origin: mi.exploratory_pixels ? "observed" : "unavailable",
    source: mi.source, relation: "not_applicable", rule: T("Indicadores espectrais exploratórios; classificação mineral não validada.", "Exploratory spectral indicators; mineral classification not validated.") }));
  out.push(ev({ id: "t_g", group: T("Alvo", "Target"), parameter: T("Gravidade", "Gravity"), value: body === "moon" ? 1.62 : 3.72, unit: "m/s²", origin: "observed", source: "NASA Planetary Fact Sheet",
    relation: "contradictory", rule: T("Nenhum lugar da Terra reproduz a gravidade (9,81 m/s²): mobilidade e poeira mudam.", "Nowhere on Earth reproduces the gravity (9.81 m/s²): mobility and dust behave differently.") }));
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
  const topo = list.filter((e) => e.groupKey === "Relevo");
  const other = list.filter((e) => e.groupKey !== "Relevo");
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
    { attr: ["topo", "relief"], ids: ["topo_slope_mean_deg", "topo_roughness_mean_m", "topo_relief_m"], criticality: "essential", measure: ["Já medido no ranking (DEM 100 m).", "Already measured in the ranking (100 m DEM)."] },
    { attr: ["escala", "scale"], ids: [], criticality: "useful", measure: ["Perfil topográfico de alta resolução (lidar ou DEM de drone) para textura < 100 m.", "High-resolution topographic profile (lidar or drone DEM) for texture < 100 m."], decision: ["Confirma se a rugosidade fina também é parecida.", "Confirms whether fine roughness is also similar."] },
    { attr: ["superfície", "surface"], ids: ["landcover_bare"], criticality: "useful", measure: ["Inspeção de imagem de alta resolução ou visita de campo.", "High-resolution imagery check or field visit."], decision: ["Se a forma está exposta ou coberta.", "Whether the landform is exposed or covered."] },
  ],
  mobilidade: [
    { attr: ["topo", "relief"], ids: ["topo_slope_mean_deg", "topo_roughness_mean_m"], criticality: "essential", measure: ["Já medido (declividade e rugosidade a 100 m).", "Already measured (slope and roughness at 100 m)."] },
    { attr: ["superfície exposta", "exposed surface"], ids: ["landcover_bare"], criticality: "essential", measure: ["Verificar em campo se a rota de teste é solo exposto.", "Check in the field that the test route is bare ground."], decision: ["Se dá para testar sem vegetação no caminho.", "Whether testing is possible without vegetation in the way."] },
    { attr: ["estabilidade", "stability"], ids: ["water"], criticality: "useful", measure: ["Checar histórico de inundação e época seca.", "Check flood history and the dry season."], decision: ["Quando o terreno fica estável para o ensaio.", "When the ground is stable enough for the test."] },
    { attr: ["material", "material"], ids: ["soil"], criticality: "essential", measure: ["Coleta de amostra + granulometria e ensaio de resistência (penetrômetro, bevameter).", "Sampling + grain-size analysis and strength test (penetrometer, bevameter)."], decision: ["Tração, afundamento e slip do rover — o SoilGrids não responde isso.", "Rover traction, sinkage and slip — SoilGrids cannot answer this."] },
    { attr: ["blocos", "boulders"], ids: [], criticality: "essential", measure: ["Contagem de blocos por imagem < 0,5 m ou drone.", "Boulder count from imagery < 0.5 m or drone."], decision: ["Obstáculos para as rodas.", "Obstacles for the wheels."] },
  ],
  instrumentacao: [
    { attr: ["geologia", "geology"], ids: ["geology"], criticality: "essential", measure: ["Mapa geológico de detalhe e visita de campo.", "Detailed geological map and field visit."], decision: ["Se a rocha é do tipo certo para o instrumento.", "Whether the rock is the right type for the instrument."] },
    { attr: ["mineralogia", "mineralogy"], ids: ["mineral_earth"], criticality: "essential", measure: ["Espectroscopia (EMIT/AVIRIS) e análise de amostras em laboratório (DRX, VNIR/SWIR).", "Spectroscopy (EMIT/AVIRIS) and laboratory sample analysis (XRD, VNIR/SWIR)."], decision: ["Quais minerais o instrumento vai encontrar.", "Which minerals the instrument will find."] },
    { attr: ["superfície exposta", "exposed surface"], ids: ["landcover_bare"], criticality: "essential", measure: ["Confirmar afloramento sem vegetação.", "Confirm an outcrop free of vegetation."], decision: ["Se o sensor enxerga a rocha.", "Whether the sensor can see the rock."] },
    { attr: ["clima", "climate"], ids: ["climate"], criticality: "useful", measure: ["Escolher época seca (climatologia).", "Pick the dry season (climatology)."], decision: ["Umidade altera as bandas de água nos espectros.", "Moisture changes the water bands in the spectra."] },
  ],
  treinamento: [
    { attr: ["geologia", "geology"], ids: ["geology"], criticality: "essential", measure: ["Documentação geológica publicada da área.", "Published geological documentation of the area."], decision: ["O que os treinandos vão observar.", "What trainees will observe."] },
    { attr: ["topo", "relief"], ids: ["topo_relief_m"], criticality: "useful", measure: ["Já medido (amplitude do relevo).", "Already measured (relief)."], decision: ["Visibilidade de afloramentos e camadas.", "Visibility of outcrops and layers."] },
    { attr: ["acesso", "access"], ids: [], criticality: "essential", measure: ["Verificar acesso, segurança e permissões (unidade de conservação, propriedade).", "Check access, safety and permits (protected area, land ownership)."], decision: ["Se dá para levar uma equipe.", "Whether a team can be brought there."] },
    { attr: ["clima", "climate"], ids: ["climate"], criticality: "useful", measure: ["Escolher época do ano (temperatura e chuva).", "Pick the time of year (temperature and rain)."], decision: ["Segurança e conforto da equipe.", "Team safety and comfort."] },
  ],
};

/** Divide o que sabemos, o que falta verificar e o próximo ensaio recomendado. */
export function nextBest(list, purpose) {
  const byId = Object.fromEntries(list.map((e) => [e.id, e]));
  const known = [], missing = [];
  for (const n of NEEDS[purpose] ?? []) {
    const items = n.ids.map((id) => byId[id]).filter(Boolean);
    const solid = items.length && items.every((e) => ["observed", "derived"].includes(e.origin) && e.relation !== "unknown");
    const loc = { ...n, attr: T(...n.attr), measure: T(...n.measure), decision: n.decision ? T(...n.decision) : undefined };
    (solid ? known : missing).push({ ...loc, items });
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
    target: { body: site.body, id: site.id, name: site.name, purpose: PURPOSES[purpose]?.label, objective, weights: core.normalizeWeights(weights) },
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
      text: m.verdict === "mirage" ? T("Relevo parecido, mas há evidências contrárias para esta finalidade: possível falso análogo.", "Similar relief, but there is contrary evidence for this purpose: possible false analog.")
        : m.verdict === "topo_differs" ? T("O relevo já difere do alvo em pelo menos uma medida.", "The relief already differs from the target in at least one measure.") : m.verdict === "undetermined" ? T("Relevo parecido; faltam dados para decidir.", "Similar relief; not enough data to decide.")
        : T("Relevo parecido e sem evidência contrária nos dados disponíveis.", "Similar relief and no contrary evidence in the available data."),
      limitations: [T("Comparação de relevo não estabelece equivalência geológica, mineral, atmosférica ou mecânica.", "A relief comparison does not establish geological, mineral, atmospheric or mechanical equivalence."), T("Gravidade, atmosfera e radiação não são reproduzíveis na Terra.", "Gravity, atmosphere and radiation cannot be reproduced on Earth.")],
      needs_validation: nb.missing.map((x) => x.measure),
    },
  };
}

export function downloadJSON(obj, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
