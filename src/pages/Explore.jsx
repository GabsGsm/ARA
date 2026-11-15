import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Segmented from "../components/ui/Segmented.jsx";
import FilterBar from "../components/explore/FilterBar.jsx";
import EarthMap from "../components/explore/EarthMap.jsx";
import RankingList from "../components/explore/RankingList.jsx";
import ResultsTable from "../components/explore/ResultsTable.jsx";
import ExportButton from "../components/explore/ExportButton.jsx";
import AnalogDetails from "../components/explore/AnalogDetails.jsx";
import DiscoverPanel from "../components/discover/DiscoverPanel.jsx";
import MineralExplorer from "../components/minerals/MineralExplorer.jsx";
import EvidencePanel from "../components/evidence/EvidencePanel.jsx";
import RobustnessMatrix from "../components/evidence/RobustnessMatrix.jsx";
import EnvironmentGap from "../components/evidence/EnvironmentGap.jsx";
import { cellExtra, useEvidence } from "../hooks/useEvidence.js";
import { useAraData } from "../hooks/useAraData.jsx";
import { useTr } from "../hooks/useSettings.jsx";
import { useExplorer } from "../hooks/useExplorer.jsx";
import { useRanking } from "../hooks/useRanking.js";
import { BODY_FROM_PARAM, PARAM_FROM_BODY, fmt } from "../lib/format.js";

const VIEWS = [{ value: "map", label: "Mapa" }, { value: "table", label: "Tabela" }];
const MODES = [{ value: "catalogo", label: "Catálogo" }, { value: "descobrir", label: "Descobrir novo local" }, { value: "minerais", label: "Minerais" }];

export default function Explore() {
  const tr = useTr();
  const data = useAraData();
  const ex = useExplorer();
  const [params, setParams] = useSearchParams();
  const { siteVec, results } = useRanking(ex.siteId, ex.weights, ex.variant);

  // ?corpo=marte|lua na URL define o corpo (links da página inicial)
  useEffect(() => {
    const b = BODY_FROM_PARAM[params.get("corpo")];
    if (b && b !== ex.body) ex.setBody(b);
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  // ?site=<id> abre direto naquele local (links do 3D e de outras páginas); ?aba=<id> abre a aba dos detalhes
  useEffect(() => {
    const id = params.get("site"), s = id && data.siteById(id);
    if (!s) return;
    if (s.body !== ex.body) ex.setBody(s.body);
    ex.setSiteId(id);
  }, [params, data]); // eslint-disable-line react-hooks/exhaustive-deps
  const tabParam = params.get("aba");

  // ao trocar de local ou de variante, seleciona o 1º lugar; senão mantém a escolha se ela ainda estiver no ranking
  const lastKey = useRef(null);
  useEffect(() => {
    const key = `${ex.siteId}|${ex.variant}`;
    const keep = lastKey.current === key && results.some((r) => r.cell.id === ex.selected);
    lastKey.current = key;
    if (!keep) ex.setSelected(results[0]?.cell.id ?? null);
  }, [results]); // eslint-disable-line react-hooks/exhaustive-deps

  // escolha feita pelo usuário: seleciona e faz o mapa voar até a célula
  const [focus, setFocus] = useState(null);
  const pick = (id) => { ex.setSelected(id); setFocus({ id, t: Date.now() }); };
  const pickFromTable = (id) => { ex.setViewMode("map"); pick(id); };

  const mode = MODES.some((m) => m.value === params.get("modo")) ? params.get("modo") : "catalogo";
  const setMode = (m) => setParams(m === "catalogo" ? { corpo: PARAM_FROM_BODY[ex.body] } : { modo: m }, { replace: true });
  const onBody = (b) => { ex.setBody(b); setParams({ corpo: PARAM_FROM_BODY[b] }, { replace: true }); };
  const selected = results.find((r) => r.cell.id === ex.selected);
  const top = results[0];
  const evidence = useEvidence();

  // abas extras dos detalhes: evidências além do relevo e robustez da decisão
  const site = ex.siteId ? data.siteById(ex.siteId) : null;
  const other = selected ? results.find((r) => r.cell.id !== selected.cell.id) : null;
  const asCandidate = (r) => ({ ...r.cell, name: data.cellName(r.cell), origin: "catalog" });
  const extraTabs = selected && site ? [
    { id: "evidencias", label: tr("Evidências"), render: () => (evidence.status === "loading"
      ? <p className="note">Carregando evidências…</p>
      : <EvidencePanel candidate={asCandidate(selected)} site={site} siteAttrs={data.sites[ex.siteId]} siteVec={siteVec}
                       extra={cellExtra(evidence, selected.cell.id)} data={data} objective={ex.objective} weights={ex.weights}
                       distance={selected.d} rankInfo={{ position: selected.position, of: data.cells.length }}
                       sourcesMeta={evidence.manifest?.datasets ?? []}
                       compare={other ? { candidate: asCandidate(other), extra: cellExtra(evidence, other.cell.id) } : null} />) },
    { id: "robustez", label: tr("Robustez"), render: () => <RobustnessMatrix siteId={ex.siteId} /> },
    { id: "ambiente", label: tr("Pressão e temperatura"), render: () => <EnvironmentGap site={site} siteAttrs={data.sites[ex.siteId]} cell={selected.cell}
                                                        cellName={data.cellName(selected.cell)} climate={cellExtra(evidence, selected.cell.id)?.climate} /> },
  ] : [];

  return (
    <section aria-labelledby="exTitle" className="ex-page mx-auto max-w-[1640px] px-[clamp(12px,2vw,30px)] pt-6">
      <header className="ex-head">
        <h1 id="exTitle" className="display ex-title">{tr("Explorar")}</h1>
        <p className="ex-lead">{tr("Encontre células de 5 × 5 km da Terra parecidas com locais de exploração em Marte e na Lua — e veja, medida por medida, em que se parecem e em que não.", "Find 5 × 5 km cells on Earth that resemble exploration sites on Mars and the Moon — and see, measure by measure, how they are alike and how they differ.")}</p>
      </header>

      <div className="ex-modes"><Segmented asTabs label="Modo" options={MODES} value={mode} onChange={setMode} /></div>

      {mode === "descobrir" ? <DiscoverPanel /> : mode === "minerais" ? <MineralExplorer /> : <>
      <FilterBar ex={ex} onBody={onBody} />

      <div className="ex-row">
        <section className="card min-w-0" aria-labelledby="resTitle">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <h2 id="resTitle" className="eyebrow mb-0 flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" fill="currentColor" /></svg>
              {tr("Análogos na Terra")}
            </h2>
            <Segmented label="Visualização" options={VIEWS} value={ex.viewMode} onChange={ex.setViewMode} />
          </div>
          {ex.variant !== "base" && (
            <p className="mt-2.5 inline-block rounded-full border border-dashed border-warn bg-warn/10 px-3 py-1 text-[13px] font-semibold text-warn">
              {tr("Simulação — não são medições reais")}
            </p>
          )}
          {ex.viewMode === "map"
            ? <EarthMap results={results} selected={ex.selected} focus={focus} onPick={pick} />
            : <ResultsTable results={results} selected={ex.selected} onPick={pickFromTable} />}
        </section>

        <section className="card ex-cands min-w-0" aria-labelledby="candTitle">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="candTitle" className="eyebrow mb-0 flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path d="M7 3h10v3h3v3a5 5 0 0 1-5 5h-.3A5 5 0 0 1 13 16.9V19h3v2H8v-2h3v-2.1A5 5 0 0 1 9.3 14H9a5 5 0 0 1-5-5V6h3V3zm10 5v4a3 3 0 0 0 1-2V8h-1zM6 8v2a3 3 0 0 0 1 2V8H6z" fill="currentColor" /></svg>
              {tr("Top candidatos")}
            </h2>
            <small className="text-[11px] text-muted">{tr("menor distância = mais parecido")}</small>
          </div>
          <RankingList siteId={ex.siteId} results={results} selected={ex.selected} onSelect={pick} />
          {results.length > 0 && (
            <ExportButton siteId={ex.siteId} siteVec={siteVec} objective={ex.objective} weights={ex.weights}
                          variant={ex.variant} results={results} />
          )}
        </section>
      </div>

      <AnalogDetails ex={ex} siteVec={siteVec} result={selected} extraTabs={extraTabs} initialTab={tabParam} />
      </>}

      <p className="sr-only" aria-live="polite">
        {top ? tr(`Melhor correspondência: ${data.cellName(top.cell)}, distância ${fmt(top.d, 3)}.`, `Best match: ${data.cellName(top.cell)}, distance ${fmt(top.d, 3)}.`) : ""}
      </p>
    </section>
  );
}
