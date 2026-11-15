import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import Card, { PageHeader } from "../components/ui/Card.jsx";
import Segmented from "../components/ui/Segmented.jsx";
import Pill from "../components/ui/Pill.jsx";
import SitePicker from "../components/explore/SitePicker.jsx";
import SiteFigure from "../components/explore/SiteFigure.jsx";
import CriteriaPanel from "../components/explore/CriteriaPanel.jsx";
import VariantPicker from "../components/explore/VariantPicker.jsx";
import EarthMap from "../components/explore/EarthMap.jsx";
import RankingList from "../components/explore/RankingList.jsx";
import ResultsTable from "../components/explore/ResultsTable.jsx";
import InspectPanel from "../components/explore/InspectPanel.jsx";
import ExportButton from "../components/explore/ExportButton.jsx";
import { useAraData } from "../hooks/useAraData.jsx";
import { useExplorer } from "../hooks/useExplorer.jsx";
import { useRanking } from "../hooks/useRanking.js";
import { BODY_FROM_PARAM, BODY_LABEL, PARAM_FROM_BODY, fmt } from "../lib/format.js";

const VIEWS = [{ value: "map", label: "Mapa" }, { value: "table", label: "Tabela" }];

export default function Explore() {
  const data = useAraData();
  const ex = useExplorer();
  const [params, setParams] = useSearchParams();
  const { siteVec, results } = useRanking(ex.siteId, ex.weights, ex.variant);

  // ?corpo=marte|lua na URL define o corpo (links da página inicial)
  useEffect(() => {
    const b = BODY_FROM_PARAM[params.get("corpo")];
    if (b && b !== ex.body) ex.setBody(b);
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  // ao trocar de local ou de variante, seleciona o 1º lugar; senão mantém a escolha se ela ainda estiver no ranking
  const lastKey = useRef(null);
  useEffect(() => {
    const key = `${ex.siteId}|${ex.variant}`;
    const keep = lastKey.current === key && results.some((r) => r.cell.id === ex.selected);
    lastKey.current = key;
    if (!keep) ex.setSelected(results[0]?.cell.id ?? null);
  }, [results]); // eslint-disable-line react-hooks/exhaustive-deps

  const onBody = (b) => { ex.setBody(b); setParams({ corpo: PARAM_FROM_BODY[b] }, { replace: true }); };
  const selected = results.find((r) => r.cell.id === ex.selected);
  const top = results[0];

  return (
    <section aria-labelledby="exTitle" className="mx-auto max-w-[1640px] px-[clamp(12px,2vw,30px)] pt-8">
      <PageHeader title={<span id="exTitle">Explorar</span>}
                  lead="Escolha um local fixo, diga para que serve o análogo e veja quais células de 5 × 5 km da Terra mais se parecem — e em quê." />
      <div className="grid items-start gap-[18px] xl:grid-cols-[320px_minmax(0,1.35fr)_minmax(330px,1fr)] md:grid-cols-[320px_1fr]">
        <Card as="aside" title="1 · Local fixo" titleId="catTitle">
          <SitePicker body={ex.body} onBody={onBody} siteId={ex.siteId} onSite={ex.setSiteId} />
          {ex.siteId
            ? <SiteFigure siteId={ex.siteId} />
            : <p className="note mt-3">Os locais de {BODY_LABEL[ex.body]} ainda não têm atributos.</p>}
          <h2 className="eyebrow mt-6">2 · Para que serve o análogo?</h2>
          <CriteriaPanel objective={ex.objective} onObjective={ex.setObjective} weights={ex.weights} onWeight={ex.setWeight} />
          <h2 className="eyebrow mt-6">3 · Qualidade dos dados</h2>
          <VariantPicker value={ex.variant} onChange={ex.setVariant} />
        </Card>

        <Card titleId="resTitle" className="min-w-0">
          <div className="flex items-center justify-between gap-2.5">
            <h2 id="resTitle" className="eyebrow mb-0">Análogos na Terra</h2>
            <Segmented label="Visualização" options={VIEWS} value={ex.viewMode} onChange={ex.setViewMode} />
          </div>
          {ex.variant !== "base" && (
            <p className="mt-2.5 inline-block rounded-full border border-dashed border-warn bg-warn/10 px-3 py-1 text-[13px] font-semibold text-warn">
              Simulação — não são medições reais
            </p>
          )}
          {ex.viewMode === "map"
            ? <EarthMap results={results} selected={ex.selected} onSelect={ex.setSelected} />
            : <ResultsTable results={results} />}
          <RankingList siteId={ex.siteId} results={results} selected={ex.selected} onSelect={ex.setSelected} />
          {results.length > 0 && (
            <ExportButton siteId={ex.siteId} siteVec={siteVec} objective={ex.objective} weights={ex.weights}
                          variant={ex.variant} results={results} />
          )}
        </Card>

        <Card title="O que é análogo — e o que não é" titleId="inspTitle" className="min-w-0 md:col-span-2 xl:col-span-1">
          <InspectPanel siteId={ex.siteId} siteVec={siteVec} result={selected} weights={ex.weights} />
          {ex.siteId && selected && (
            <Pill to={`/3d?site=${ex.siteId}&analog=${selected.cell.id}`} variant="gold" size="sm" className="mt-4">
              Ver lado a lado em 3D
            </Pill>
          )}
        </Card>
      </div>
      <p className="sr-only" aria-live="polite">
        {top ? `Melhor correspondência: ${data.cellName(top.cell)}, distância ${fmt(top.d, 3)}.` : ""}
      </p>
    </section>
  );
}
