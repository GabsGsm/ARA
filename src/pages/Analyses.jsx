import * as core from "../lib/core.js";
import Card, { PageHeader } from "../components/ui/Card.jsx";
import StatusChip from "../components/ui/StatusChip.jsx";
import { useAraData } from "../hooks/useAraData.jsx";
import { useExplorer } from "../hooks/useExplorer.jsx";
import { BODY_LABEL, dataUrl, fmt } from "../lib/format.js";
import { T } from "../lib/i18n.js";

function topFor(data, siteId, weights, variant = "base", n = 3) {
  const vec = core.siteVector(data.sites[siteId], variant, data.sim, siteId);
  return core.rank(vec, core.cellsForVariant(data.cells, variant, data.sim), weights, data.scales, n);
}

function TopList({ rows, cellName }) {
  if (!rows.length) return "—";
  return (
    <ol className="m-0 pl-5">
      {rows.map((r) => <li key={r.cell.id}>{cellName(r.cell)} <small className="text-muted">({fmt(r.d, 3)})</small></li>)}
    </ol>
  );
}

export default function Analyses() {
  const data = useAraData();
  const { siteId: chosen } = useExplorer();
  const siteId = chosen || data.catalog.sites.find((s) => data.hasTerrain(s.id))?.id;
  if (!siteId) return <p className="note p-8">{T("Sem locais com atributos.", "No sites with attributes.")}</p>;
  const site = data.siteById(siteId);
  const { config, stability, sim } = data;
  const cfgS = config.stability;
  const stab = Object.entries(stability?.sites?.[siteId] ?? {})
    .sort((a, b) => b[1].topk_pct - a[1].topk_pct || b[1].top1_pct - a[1].top1_pct).slice(0, 6);
  const thermal = data.sites[siteId]?.thermal;
  const sources = new Map();
  data.catalog.sites.forEach((s) => (s.sources ?? []).forEach((x) => sources.set(x.url, x.name)));

  return (
    <section aria-labelledby="anTitle" className="mx-auto max-w-[1640px] px-[clamp(12px,2vw,30px)] pt-8">
      <PageHeader title={<span id="anTitle">{T("Análises", "Analyses")}</span>}
                  lead={T("Quanto o resultado depende dos pesos e da qualidade dos dados — e como o ranking é calculado.", "How much the result depends on the weights and on data quality — and how the ranking is computed.")}>
        <p className="note mt-2">{T("Local analisado", "Site analysed")}: {site.name} ({T(BODY_LABEL[site.body])}). {T("Troque em Explorar.", "Change it in Explore.")}</p>
      </PageHeader>

      <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(380px,100%),1fr))]">
        <Card as="article" title={T("Sensibilidade ao objetivo", "Sensitivity to the objective")} titleId="an1">
          <p className="text-[13px] text-ink-2">{T("O mesmo local, com pesos diferentes. Um análogo pode ser ótimo para um uso e fraco para outro.", "The same site with different weights. An analog can be excellent for one use and poor for another.")}</p>
          <table className="data-table"><thead><tr><th>{T("Objetivo")}</th><th>{T("3 melhores", "Top 3")}</th></tr></thead>
            <tbody>{Object.entries(config.objectives).map(([k, o]) => (
              <tr key={k}><th scope="row">{T(o.label)}</th><td><TopList rows={topFor(data, siteId, o.weights)} cellName={data.cellName} /></td></tr>
            ))}</tbody></table>
        </Card>

        <Card as="article" title={T("Qualidade dos dados")} titleId="an2">
          <p className="text-[13px] text-ink-2">{T("O ranking recalculado com dados piores. Se ele muda muito, a conclusão depende mais dos dados do que do terreno.", "The ranking recomputed with worse data. If it changes a lot, the conclusion depends more on the data than on the terrain.")}</p>
          {sim ? (
            <table className="data-table"><thead><tr><th>{T("Dados", "Data")}</th><th>{T("3 melhores", "Top 3")}</th></tr></thead>
              <tbody>{sim.variants.map((v) => (
                <tr key={v.id}>
                  <th scope="row">{T(v.label)} {v.id !== "base" && <StatusChip status="partial">{T("simulação", "simulation")}</StatusChip>}</th>
                  <td><TopList rows={topFor(data, siteId, config.objectives.default.weights, v.id)} cellName={data.cellName} /></td>
                </tr>
              ))}</tbody></table>
          ) : <p className="note">{T("Rode", "Run")} <code>pipeline/build_simulation.py</code> {T("para gerar as variantes.", "to generate the variants.")}</p>}
        </Card>

        <Card as="article" title={T("Estabilidade", "Stability")} titleId="an3">
          <p className="text-[13px] text-ink-2">{T(`${fmt(cfgS.draws, 0)} conjuntos de pesos aleatórios (${cfgS.distribution}, semente ${cfgS.seed}). Mede a sensibilidade aos pesos, não a probabilidade de ser um análogo verdadeiro.`, `${fmt(cfgS.draws, 0)} random weight sets (${cfgS.distribution}, seed ${cfgS.seed}). It measures sensitivity to the weights, not the probability of being a true analog.`)}</p>
          {stab.length ? (
            <table className="data-table"><thead><tr><th>{T("Célula", "Cell")}</th><th>{T("% em 1º", "% as #1")}</th><th>{T("% no top", "% in top")} {cfgS.top_k}</th></tr></thead>
              <tbody>{stab.map(([cid, v]) => {
                const c = data.cells.find((x) => x.id === cid);
                return <tr key={cid}><td>{c ? data.cellName(c) : cid}</td><td>{fmt(v.top1_pct)}</td><td>{fmt(v.topk_pct)}</td></tr>;
              })}</tbody></table>
          ) : <p className="note">{T("Rode", "Run")} <code>pipeline/stability.py</code>.</p>}
        </Card>

        <Card as="article" title={site.body === "moon" ? T("Temperatura na Lua", "Temperature on the Moon") : T("Temperatura em Marte", "Temperature on Mars")} titleId="an4">
          {thermal?.display?.length ? (
            <>
              <table className="data-table"><tbody>{thermal.display.filter((d) => d.value != null).map((d) => (
                <tr key={d.label}><th scope="row">{d.label}</th><td>{fmt(d.value, 0)} {d.unit}{d.note && <small className="block text-muted">{d.note}</small>}</td></tr>
              ))}</tbody></table>
              <p className="note">{thermal.note}. {T("A temperatura da Terra ainda não foi calculada para as células, por isso esta dimensão aparece como “sem dado” na comparação.", "Earth temperature has not yet been computed for the cells, so this dimension shows as “no data” in the comparison.")}</p>
            </>
          ) : <p className="note">{T("Sem dado térmico para este local.", "No thermal data for this site.")}</p>}
        </Card>

        <Card as="article" title={T("Como o ranking é calculado", "How the ranking is computed")} titleId="an5">
          <p className="text-[13px] text-ink-2">{T("Cada local e cada célula da Terra é uma janela de 5 × 5 km a 100 m/pixel. Atributos: declividade média, rugosidade média (desvio-padrão local em janela 3 × 3) e amplitude (máximo − mínimo).", "Each site and each Earth cell is a 5 × 5 km window at 100 m/pixel. Attributes: mean slope, mean roughness (local standard deviation in a 3 × 3 window) and relief (maximum − minimum).")}</p>
          <p className="overflow-x-auto rounded-xl border border-line-2 bg-petrol-950/60 px-3.5 py-3 font-display text-[13px]">{T("d = √( Σ wᵢ · ((localᵢ − célulaᵢ) / escalaᵢ)² )", "d = √( Σ wᵢ · ((siteᵢ − cellᵢ) / scaleᵢ)² )")}</p>
          <p className="text-[13px] text-ink-2">
            {T("Escalas", "Scales")}: {Object.values(config.attributes).map((x) => `${x.scale}${x.unit === "°" ? "" : " "}${x.unit}`).join(", ")}.
            {T("Pesos padrão", "Default weights")}: {Object.values(config.objectives.default.weights).map((x) => fmt(x, 2)).join(" / ")}.
            {T("Uma dimensão é", "A dimension is")} <strong>{T("análoga", "analogous")}</strong> {T("quando |local − célula| / escala ≤", "when |site − cell| / scale ≤")} {fmt(config.thresholds.good, 2)}, <strong>{T("parcial", "partial")}</strong> {T("até", "up to")} {fmt(config.thresholds.weak, 2)} {T("e", "and")} <strong>{T("não análoga", "not analogous")}</strong> {T("acima disso.", "above that.")}
          </p>
        </Card>

        <Card as="article" title={T("Onde a analogia sempre falha", "Where the analogy always fails")} titleId="an6">
          <ul className="m-0 pl-5">{config.earth_limits.map((l) => <li key={l.dimension}><strong>{l.dimension}:</strong> {l.text}</li>)}</ul>
        </Card>

        <Card as="article" title={T("Fontes", "Sources")} titleId="an7" className="[grid-column:1/-1]">
          <ul className="m-0 columns-1 pl-5 md:columns-2">
            {[...sources].map(([u, n]) => <li key={u}><a href={dataUrl(u)} target="_blank" rel="noopener noreferrer">{n}</a></li>)}
            <li>{T("DEM da Terra", "Earth DEM")}: {data.grid.dem}</li>
            <li>{T("Execuções do pipeline", "Pipeline runs")}: {(data.grid.run_ids ?? []).join(", ")}</li>
          </ul>
        </Card>
      </div>
    </section>
  );
}
