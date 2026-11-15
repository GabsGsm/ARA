// Detalhes do análogo selecionado, em abas: Resumo · Comparação · Limitações · Fontes.
// Nada some do layout antigo: a tabela completa e as notas ficam em "Comparação"; método e
// limites em "Limitações"; fontes, mapa de contexto do Trek e rastreio em "Fontes".
import { useEffect, useState } from "react";
import * as core from "../../lib/core.js";
import { useAraData } from "../../hooks/useAraData.jsx";
import { useTr } from "../../hooks/useSettings.jsx";
import { useStabilityText } from "../../hooks/useRanking.js";
import { BODY_LABEL, fmt, withUnit } from "../../lib/format.js";
import StatusChip from "../ui/StatusChip.jsx";
import Pill from "../ui/Pill.jsx";
import InspectPanel from "./InspectPanel.jsx";
import MLProfile from "./MLProfile.jsx";
import SiteFigure from "./SiteFigure.jsx";
import TrekMap from "./TrekMap.jsx";
import { T } from "../../lib/i18n.js";

const TABS = [{ id: "resumo", label: "Resumo" }, { id: "comparacao", label: "Comparação" }, { id: "limitacoes", label: "Limitações" }, { id: "fontes", label: "Fontes" }];
// Constantes físicas conhecidas (NASA Planetary Fact Sheets)
const BODY_PHYS = {
  mars: { g: 0.379, get gText() { return `${fmt(0.38, 2)} g`; }, get atm() { return T("≈ 0,6% da Terra (≈ 6 mbar)", "≈ 0.6% of Earth (≈ 6 mbar)"); } },
  moon: { g: 0.165, get gText() { return `${fmt(0.17, 2)} g`; }, get atm() { return T("praticamente vácuo", "practically vacuum"); } },
};

export default function AnalogDetails({ ex, siteVec, result, extraTabs = [], initialTab = null }) {
  const data = useAraData();
  const stabilityText = useStabilityText();
  const tr = useTr();
  const [tab, setTab] = useState(initialTab || "resumo");
  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);
  const tabs = [...TABS, ...extraTabs.map((t) => ({ id: t.id, label: t.label }))];
  if (!result || !ex.siteId) {
    return <section className="card ex-details"><p className="note m-0">{tr("Selecione um candidato para ver os detalhes.")}</p></section>;
  }
  const site = data.siteById(ex.siteId);
  const cell = result.cell;
  const dims = core.explain({ ...data.sites[ex.siteId], terrain: siteVec }, cell, data.config);
  const topo = dims.filter((d) => d.attr in data.config.attributes);
  const nGood = topo.filter((d) => d.status === "analog").length;
  const overall = nGood === topo.length ? "analog" : topo.some((d) => d.status === "analog" || d.status === "partial") ? "partial" : "not_analog";
  const like = topo.filter((d) => d.status === "analog" || d.status === "partial");
  const unlike = topo.filter((d) => d.status === "not_analog");
  const phys = BODY_PHYS[site.body];
  const st = stabilityText(ex.siteId, cell.id);
  const extra = extraTabs.find((t) => t.id === tab);

  return (
    <section className="card ex-details" aria-labelledby="exDetTitle">
      <div className="ex-det-head">
        <h2 id="exDetTitle" className="eyebrow mb-0">{tr("Detalhes do análogo selecionado")}</h2>
        <div role="tablist" aria-label={tr("Detalhes", "Details")} className="ex-tabs">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls="ex-det-panel" onClick={() => setTab(t.id)}>{tr(t.label)}</button>
          ))}
        </div>
      </div>

      <div id="ex-det-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="ex-det-body">
        {tab === "resumo" && (
          <div className="ex-resumo">
            <div className="ex-thumb">
              <SiteFigure siteId={ex.siteId} compact showTrek={false} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="ex-pair">{site.name} <span aria-hidden="true">→</span> {data.cellName(cell)}</h3>
                  <p className="m-0 text-[13px] text-ink-2">{T("Célula selecionada", "Selected cell")}: <b className="font-mono">{cell.id}</b> · {fmt(cell.lat, 2)}°, {fmt(cell.lon, 2)}° · {T(`${result.position}º lugar`, `#${result.position}`)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusChip status={overall}>{tr(overall === "analog" ? "Relevo análogo" : overall === "partial" ? "Parcialmente análogo" : "Relevo não análogo")}</StatusChip>
                  <div className="text-right">
                    <small className="block text-[11px] text-muted">{tr("Distância ARA")}</small>
                    <b className="ex-bigscore">{fmt(result.d, 3)}</b>
                  </div>
                </div>
              </div>
              <div className="ex-likes">
                <div className="ex-like ok">
                  <h4><span aria-hidden="true">✓</span> {tr("O que é análogo?")}</h4>
                  {like.length ? (
                    <ul>{like.map((d) => <li key={d.attr}>{T(d.dimension)}: {withUnit(d.site, d.unit)} × {withUnit(d.cell, d.unit)}{d.status === "partial" ? T(" (parcial)", " (partial)") : ""}</li>)}</ul>
                  ) : <p>{T("Nenhuma das três medidas de relevo ficou dentro dos limites.", "None of the three relief measures fell within the limits.")}</p>}
                </div>
                <div className="ex-like bad">
                  <h4><span aria-hidden="true">✕</span> {tr("O que não é análogo?")}</h4>
                  <ul>
                    {unlike.map((d) => <li key={d.attr}>{T(d.dimension)}: {withUnit(d.site, d.unit)} × {withUnit(d.cell, d.unit)}</li>)}
                    <li>{T(`Gravidade (${phys.gText} × 1 g), atmosfera (${phys.atm}) e radiação — nenhum lugar da Terra reproduz.`, `Gravity (${phys.gText} × 1 g), atmosphere (${phys.atm}) and radiation — no place on Earth reproduces them.`)}</li>
                  </ul>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Pill to={`/3d?site=${ex.siteId}&analog=${cell.id}`} variant="gold" size="sm">{tr("Ver lado a lado em 3D")}</Pill>
                {st && <small className="text-muted">Estabilidade em 2.000 conjuntos de pesos aleatórios: {st}.</small>}
              </div>
            </div>
            <div className="ex-main-table">
              <h4 className="eyebrow mb-2">{tr("Comparação principal")}</h4>
              <table className="data-table m-0">
                <thead><tr><th>{tr("Atributo")}</th><th>{tr(BODY_LABEL[site.body])}</th><th>{tr("Terra")}</th><th>{tr("Avaliação")}</th></tr></thead>
                <tbody>
                  {topo.map((d) => (
                    <tr key={d.attr}><th scope="row">{tr(d.dimension)}</th><td>{withUnit(d.site, d.unit)}</td><td>{withUnit(d.cell, d.unit)}</td><td><StatusChip status={d.status} /></td></tr>
                  ))}
                  <tr><th scope="row">{tr("Gravidade")}</th><td>{phys.gText}</td><td>1 g</td><td><StatusChip status="not_analog" /></td></tr>
                  <tr><th scope="row">{tr("Atmosfera")}</th><td>{phys.atm}</td><td>1 atm</td><td><StatusChip status="not_analog" /></td></tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "comparacao" && <><InspectPanel siteId={ex.siteId} siteVec={siteVec} result={result} weights={ex.weights} /><MLProfile siteId={ex.siteId} cellId={cell.id} /></>}

        {tab === "limitacoes" && (
          <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <div className="ex-method">
                <div><b>{T("Célula", "Cell")}</b><span>5 × 5 km</span></div>
                <div><b>{T("Dados", "Data")}</b><span>{ex.variant === "base" ? T("Originais (100 m)", "Original (100 m)") : (data.sim?.variants?.find((v) => v.id === ex.variant)?.label ?? ex.variant)}</span></div>
                <div><b>{T("Método", "Method")}</b><span>{T("Distância ponderada em declividade, rugosidade e amplitude", "Weighted distance over slope, roughness and relief")}</span></div>
              </div>
              <p className="desc mt-3">
                {T(`Análogo se a diferença normalizada ≤ ${fmt(data.config.thresholds.good, 2)}; parcial até ${fmt(data.config.thresholds.weak, 2)}; acima disso, não análogo. A estabilidade sorteia ${fmt(data.config.stability.draws, 0)} conjuntos de pesos (${data.config.stability.distribution}, semente ${data.config.stability.seed}) — mede sensibilidade aos pesos, não probabilidade de ser análogo.`,
                   `Analog if the normalised difference ≤ ${fmt(data.config.thresholds.good, 2)}; partial up to ${fmt(data.config.thresholds.weak, 2)}; above that, not analog. Stability draws ${fmt(data.config.stability.draws, 0)} weight sets (${data.config.stability.distribution}, seed ${data.config.stability.seed}) — it measures sensitivity to the weights, not the probability of being an analog.`)}
              </p>
              {ex.variant !== "base" && <p className="mt-2 inline-block rounded-full border border-dashed border-warn bg-warn/10 px-3 py-1 text-[13px] font-semibold text-warn">{T("Simulação — não são medições reais", "Simulation — not real measurements")}</p>}
              {site.center_pending_validation && <p className="mt-2 text-[13px] text-warn">{T("O centro deste recorte ainda aguarda validação final.", "The centre of this site is still awaiting final validation.")}</p>}
            </div>
            <div>
              <h4 className="eyebrow mb-2">{T("O que nenhum lugar da Terra reproduz", "What no place on Earth reproduces")}</h4>
              <ul className="list-clean text-[13px] text-ink-2">
                {data.config.earth_limits.map((l) => <li key={l.dimension}><b>{T(l.dimension)}:</b> {T(l.text)}</li>)}
              </ul>
              <p className="desc mt-3">{T("Três estatísticas de relevo não descrevem orientação das encostas, drenagem nem textura em várias escalas. Pesos e escalas não foram calibrados por especialistas. Os DEMs da Terra e dos planetas vêm de instrumentos diferentes. Litologia mapeada não é mineralogia verificada.", "Three relief statistics do not describe slope orientation, drainage or multi-scale texture. Weights and scales were not calibrated by experts. Earth and planetary DEMs come from different instruments. Mapped lithology is not verified mineralogy.")}</p>
            </div>
          </div>
        )}

        {tab === "fontes" && (
          <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
            <div>
              <h4 className="eyebrow mb-2">{site.name}</h4>
              <ul className="list-clean text-[13px]">
                {(site.sources ?? []).map((s) => <li key={s.name}>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name} ↗</a> : s.name}</li>)}
              </ul>
              <h4 className="eyebrow mb-2 mt-4">{T("Terra", "Earth")}</h4>
              <ul className="list-clean text-[13px]">
                <li>{T("Relevo da grade", "Grid relief")}: {data.grid.dem}</li>
                {cell.context?.geology_source && <li>{T("Geologia", "Geology")}: {cell.context.geology_source}</li>}
                <li>{T("Imagens do mapa: Esri World Imagery; camada opcional NASA GIBS (MODIS)", "Map imagery: Esri World Imagery; optional NASA GIBS (MODIS) layer")}</li>
              </ul>
              <h4 className="eyebrow mb-2 mt-4">{T("Rastreio das execuções", "Run trace")}</h4>
              <p className="m-0 break-all font-mono text-[11px] text-muted">{(data.grid.run_ids ?? []).join(" · ")}</p>
            </div>
            <div>
              <h4 className="eyebrow mb-2">{site.body === "moon" ? T("Mapa de contexto (NASA LOLA)", "Context map (NASA LOLA)") : T("Mapa de contexto (NASA Trek)", "Context map (NASA Trek)")}</h4>
              <TrekMap site={site} layer={data.config.planet_maps?.[site.body]} />
              <p className="note mt-2">{T(site.why)}</p>
            </div>
          </div>
        )}

        {extra && extra.render()}
      </div>
    </section>
  );
}
