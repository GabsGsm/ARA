import * as core from "../lib/core.js";
import Card, { PageHeader } from "../components/ui/Card.jsx";
import StatusChip from "../components/ui/StatusChip.jsx";
import { useAraData } from "../hooks/useAraData.jsx";
import { useExplorer } from "../hooks/useExplorer.jsx";
import { BODY_LABEL, dataUrl, fmt } from "../lib/format.js";

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
  if (!siteId) return <p className="note p-8">Sem locais com atributos.</p>;
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
      <PageHeader title={<span id="anTitle">Análises</span>}
                  lead="Quanto o resultado depende dos pesos e da qualidade dos dados — e como o ranking é calculado.">
        <p className="note mt-2">Local analisado: {site.name} ({BODY_LABEL[site.body]}). Troque em Explorar.</p>
      </PageHeader>

      <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(380px,100%),1fr))]">
        <Card as="article" title="Sensibilidade ao objetivo" titleId="an1">
          <p className="text-[13px] text-ink-2">O mesmo local, com pesos diferentes. Um análogo pode ser ótimo para um uso e fraco para outro.</p>
          <table className="data-table"><thead><tr><th>Objetivo</th><th>3 melhores</th></tr></thead>
            <tbody>{Object.entries(config.objectives).map(([k, o]) => (
              <tr key={k}><th scope="row">{o.label}</th><td><TopList rows={topFor(data, siteId, o.weights)} cellName={data.cellName} /></td></tr>
            ))}</tbody></table>
        </Card>

        <Card as="article" title="Qualidade dos dados" titleId="an2">
          <p className="text-[13px] text-ink-2">O ranking recalculado com dados piores. Se ele muda muito, a conclusão depende mais dos dados do que do terreno.</p>
          {sim ? (
            <table className="data-table"><thead><tr><th>Dados</th><th>3 melhores</th></tr></thead>
              <tbody>{sim.variants.map((v) => (
                <tr key={v.id}>
                  <th scope="row">{v.label} {v.id !== "base" && <StatusChip status="partial">simulação</StatusChip>}</th>
                  <td><TopList rows={topFor(data, siteId, config.objectives.default.weights, v.id)} cellName={data.cellName} /></td>
                </tr>
              ))}</tbody></table>
          ) : <p className="note">Rode <code>pipeline/build_simulation.py</code> para gerar as variantes.</p>}
        </Card>

        <Card as="article" title="Estabilidade" titleId="an3">
          <p className="text-[13px] text-ink-2">{fmt(cfgS.draws, 0)} conjuntos de pesos aleatórios ({cfgS.distribution}, semente {cfgS.seed}). Mede a sensibilidade aos pesos, não a probabilidade de ser um análogo verdadeiro.</p>
          {stab.length ? (
            <table className="data-table"><thead><tr><th>Célula</th><th>% em 1º</th><th>% no top {cfgS.top_k}</th></tr></thead>
              <tbody>{stab.map(([cid, v]) => {
                const c = data.cells.find((x) => x.id === cid);
                return <tr key={cid}><td>{c ? data.cellName(c) : cid}</td><td>{fmt(v.top1_pct)}</td><td>{fmt(v.topk_pct)}</td></tr>;
              })}</tbody></table>
          ) : <p className="note">Rode <code>pipeline/stability.py</code>.</p>}
        </Card>

        <Card as="article" title={site.body === "moon" ? "Temperatura na Lua" : "Temperatura em Marte"} titleId="an4">
          {thermal?.display?.length ? (
            <>
              <table className="data-table"><tbody>{thermal.display.filter((d) => d.value != null).map((d) => (
                <tr key={d.label}><th scope="row">{d.label}</th><td>{fmt(d.value, 0)} {d.unit}{d.note && <small className="block text-muted">{d.note}</small>}</td></tr>
              ))}</tbody></table>
              <p className="note">{thermal.note}. A temperatura da Terra ainda não foi calculada para as células, por isso esta dimensão aparece como “sem dado” na comparação.</p>
            </>
          ) : <p className="note">Sem dado térmico para este local.</p>}
        </Card>

        <Card as="article" title="Como o ranking é calculado" titleId="an5">
          <p className="text-[13px] text-ink-2">Cada local e cada célula da Terra é uma janela de 5 × 5 km a 100 m/pixel. Atributos: declividade média, rugosidade média (desvio-padrão local em janela 3 × 3) e amplitude (máximo − mínimo).</p>
          <p className="overflow-x-auto rounded-xl border border-line-2 bg-petrol-950/60 px-3.5 py-3 font-display text-[13px]">d = √( Σ wᵢ · ((localᵢ − célulaᵢ) / escalaᵢ)² )</p>
          <p className="text-[13px] text-ink-2">
            Escalas: {Object.values(config.attributes).map((x) => `${x.scale}${x.unit === "°" ? "" : " "}${x.unit}`).join(", ")}.
            Pesos padrão: {Object.values(config.objectives.default.weights).map((x) => fmt(x, 2)).join(" / ")}.
            Uma dimensão é <strong>análoga</strong> quando |local − célula| / escala ≤ {fmt(config.thresholds.good, 2)}, <strong>parcial</strong> até {fmt(config.thresholds.weak, 2)} e <strong>não análoga</strong> acima disso.
          </p>
        </Card>

        <Card as="article" title="Onde a analogia sempre falha" titleId="an6">
          <ul className="m-0 pl-5">{config.earth_limits.map((l) => <li key={l.dimension}><strong>{l.dimension}:</strong> {l.text}</li>)}</ul>
        </Card>

        <Card as="article" title="Fontes" titleId="an7" className="[grid-column:1/-1]">
          <ul className="m-0 columns-1 pl-5 md:columns-2">
            {[...sources].map(([u, n]) => <li key={u}><a href={dataUrl(u)} target="_blank" rel="noopener noreferrer">{n}</a></li>)}
            <li>DEM da Terra: {data.grid.dem}</li>
            <li>Execuções do pipeline: {(data.grid.run_ids ?? []).join(", ")}</li>
          </ul>
        </Card>
      </div>
    </section>
  );
}
