// Painel de evidências de um candidato: finalidade da missão, cartões (favorável / diferença / ausente / contexto),
// "O que o ranking não mostra?" (Analog Mirage), "O que falta saber?" (Next Best Measurement), cobertura dos
// dados e a ficha exportável (Analog Passport).
import { useMemo, useState } from "react";
import { ORIGIN, PURPOSES, RELATION, downloadJSON, evidenceFor, mirage, nextBest, passport, tally, targetEvidence } from "../../lib/evidence/engine.js";
import { fmt } from "../../lib/format.js";
import { T } from "../../lib/i18n.js";

const GROUP_ORDER = () => [T("Relevo", "Relief"), T("Superfície", "Surface"), T("Estabilidade", "Stability"), T("Solo", "Soil"), T("Geologia", "Geology"), T("Mineralogia", "Mineralogy"), T("Ambiente", "Environment"), T("Alvo", "Target")];

function Card({ e, open, onToggle }) {
  const r = RELATION[e.relation];
  const val = e.value == null ? "—" : typeof e.value === "number" ? `${fmt(e.value, Math.abs(e.value) >= 100 ? 0 : 1)}${e.unit ? ` ${e.unit}` : ""}` : e.value;
  return (
    <li className={`ev-card ${r.tone}`}>
      <button type="button" aria-expanded={open} onClick={onToggle}>
        <span className="ev-dot" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <b>{e.parameter}</b>
          <small>{r.label} · {ORIGIN[e.origin]}</small>
        </span>
        <span className="ev-val">{val}{e.target != null && <small> {T("alvo", "target")} {fmt(e.target, 1)}</small>}</span>
      </button>
      {open && (
        <div className="ev-more">
          {e.rule && <p><b>{T("Regra", "Rule")}:</b> {e.rule}</p>}
          {e.detail?.length > 0 && <ul>{e.detail.map((d) => <li key={d}>{d}</li>)}</ul>}
          <p className="ev-prov">
            <b>{T("Fonte", "Source")}:</b> {e.source}{e.resolution_m ? ` · ${fmt(e.resolution_m, 0)} m` : ""}{e.period ? ` · ${e.period}` : ""}{e.method ? ` · ${e.method}` : ""}
          </p>
          {e.caveats?.filter(Boolean).map((c) => <p key={c} className="ev-caveat">⚠ {c}</p>)}
        </div>
      )}
    </li>
  );
}

export default function EvidencePanel({ candidate, site, siteAttrs, siteVec, extra, data, objective, weights, distance, rankInfo, exploratory, sourcesMeta, compare }) {
  const [purpose, setPurpose] = useState(objective === "rover" ? "mobilidade" : "geomorfologia");
  const [openId, setOpenId] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const list = useMemo(() => build(candidate, siteVec, extra, site, purpose, data), [candidate, siteVec, extra, site, purpose, data]);
  const target = useMemo(() => targetEvidence(siteAttrs, site.body), [siteAttrs, site.body]);
  const t = tally(list);
  const m = mirage(list);
  const nb = nextBest(list, purpose);
  const groups = GROUP_ORDER().map((g) => [g, list.filter((e) => e.group === g)]).filter(([, l]) => l.length);
  const cmp = useMemo(() => (compare ? build(compare.candidate, siteVec, compare.extra, site, purpose, data) : null), [compare, siteVec, site, purpose, data]);
  const relief = T("Relevo", "Relief");

  const exportPassport = () => downloadJSON(passport({
    candidate, site, purpose, objective, weights, list: [...list, ...target], distance, rankInfo, data, sourcesMeta,
  }), `ARA_passport_${site.id}_${candidate.id}.json`);

  const VERDICT = {
    mirage: { cls: "bad", title: T("Possível falso análogo", "Possible false analog"), text: T("O relevo passa no ranking, mas há evidência contrária para esta finalidade.", "The relief passes the ranking, but there is contrary evidence for this purpose.") },
    topo_differs: { cls: "warn", title: T("O relevo já difere", "The relief already differs"), text: T("Pelo menos uma das três medidas fica fora do limite do ARA.", "At least one of the three measures falls outside ARA's limit.") },
    undetermined: { cls: "none", title: T("Faltam dados para decidir", "Not enough data to decide"), text: T("Relevo parecido, mas várias evidências estão ausentes.", "Similar relief, but several pieces of evidence are missing.") },
    consistent: { cls: "ok", title: T("Coerente com o ranking", "Consistent with the ranking"), text: T("Relevo parecido e nenhuma evidência contrária nos dados disponíveis.", "Similar relief and no contrary evidence in the available data.") },
  }[m.verdict];
  const vword = (v) => (v === "mirage" ? T("falso análogo?", "false analog?") : v === "consistent" ? T("coerente", "consistent") : T("incerto", "uncertain"));

  return (
    <div className="ev-panel">
      <div className="ev-top">
        <label className="ev-purpose">
          <span>{T("Finalidade do análogo", "Purpose of the analog")}</span>
          <select className="field" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            {Object.keys(PURPOSES).map((k) => <option key={k} value={k}>{PURPOSES[k].label}</option>)}
          </select>
        </label>
        <div className="ev-tally" aria-label={T("Resumo das evidências", "Evidence summary")}>
          <span className="ok">{t.supporting} {T("favoráveis", "supporting")}</span>
          <span className="bad">{t.contradictory} {T("diferenças", "differences")}</span>
          <span className="none">{t.unknown} {T("sem dado", "no data")}</span>
          <span className="info">{t.not_applicable} {T("contexto", "context")}</span>
        </div>
        <button type="button" className="ev-export" onClick={exportPassport}>{T("Exportar ficha (Analog Passport) ↓", "Export sheet (Analog Passport) ↓")}</button>
      </div>
      {exploratory && <p className="ev-explor">{T("Comparação exploratória: diferenças de resolução e processamento podem limitar a equivalência com o catálogo.", "Exploratory comparison: differences in resolution and processing may limit equivalence with the catalogue.")}</p>}

      <div className="ev-grid">
        <section aria-label={T("Evidências", "Evidence")}>
          {groups.map(([g, l]) => (
            <div key={g} className="ev-group">
              <h4>{g}</h4>
              <ul>{l.map((e) => <Card key={e.id} e={e} open={openId === e.id} onToggle={() => setOpenId(openId === e.id ? null : e.id)} />)}</ul>
            </div>
          ))}
          <div className="ev-group">
            <h4>{T("Alvo", "Target")}: {site.name}</h4>
            <ul>{target.slice(0, showAll ? 99 : 3).map((e) => <Card key={e.id} e={e} open={openId === e.id} onToggle={() => setOpenId(openId === e.id ? null : e.id)} />)}</ul>
            {target.length > 3 && <button type="button" className="ev-link" onClick={() => setShowAll((v) => !v)}>{showAll ? T("Mostrar menos", "Show less") : T(`Mais ${target.length - 3}`, `${target.length - 3} more`)}</button>}
          </div>
        </section>

        <section aria-label={T("Decisão", "Decision")}>
          <div className={`ev-verdict ${VERDICT.cls}`}>
            <h4>{T("O que o ranking não mostra?", "What doesn't the ranking show?")}</h4>
            <b>{VERDICT.title}</b>
            <p>{VERDICT.text}</p>
            {m.against.length > 0 && <p className="mt-1"><b>{T("Contra", "Against")}:</b> {m.against.map((e) => e.parameter).join(", ")}.</p>}
            {cmp && (
              <div className="ev-cmp">
                <small>{T("Comparação com", "Comparison with")} {compare.candidate.name}:</small>
                <table className="data-table m-0">
                  <thead><tr><th /><th>{candidate.name}</th><th>{compare.candidate.name}</th></tr></thead>
                  <tbody>
                    {["supporting", "contradictory", "unknown"].map((k) => (
                      <tr key={k}><th scope="row">{RELATION[k].label}</th><td>{tally(list)[k]}</td><td>{tally(cmp)[k]}</td></tr>
                    ))}
                    <tr><th scope="row">{T("Veredito", "Verdict")}</th><td>{vword(mirage(list).verdict)}</td><td>{vword(mirage(cmp).verdict)}</td></tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="ev-nbm">
            <h4>{PURPOSES[purpose].question}</h4>
            <div className="ev-cols">
              <div>
                <b className="ok">{T("Sabemos", "We know")}</b>
                <ul>{nb.known.map((k) => <li key={k.attr}>{k.attr}: {k.measure}</li>)}{!nb.known.length && <li>{T("Nada sólido ainda.", "Nothing solid yet.")}</li>}</ul>
              </div>
              <div>
                <b className="warn">{T("Falta verificar", "Still to check")}</b>
                <ul>{nb.missing.map((k) => <li key={k.attr}>{k.attr} <small>({k.criticality === "essential" ? T("essencial", "essential") : T("útil", "useful")})</small></li>)}{!nb.missing.length && <li>{T("Nada essencial pendente.", "Nothing essential pending.")}</li>}</ul>
              </div>
              <div className="ev-next">
                <b className="gold">{T("Próximo ensaio", "Next test")}</b>
                {nb.next ? <><p>{nb.next.measure}</p>{nb.next.decision && <small>{T("Ajuda a decidir", "Helps decide")}: {nb.next.decision}</small>}</> : <p>{T("Nenhum pendente nas regras atuais.", "None pending under the current rules.")}</p>}
              </div>
            </div>
            <p className="ev-caveat">{T("Recomendação por regras explícitas da equipe — não é medição realizada nem probabilidade calibrada.", "Recommendation from the team's explicit rules — not a measurement taken nor a calibrated probability.")}</p>
          </div>

          <div className="ev-coverage">
            <h4>{T("Cobertura dos dados", "Data coverage")}</h4>
            <ul>
              {list.filter((e, i, a) => a.findIndex((x) => x.group === e.group) === i && e.group !== relief).map((e) => {
                const has = list.some((x) => x.group === e.group && x.origin !== "unavailable");
                return <li key={e.group} className={has ? "has" : "no"}><span aria-hidden="true">{has ? "■" : "▨"}</span>{e.group}: {has ? T("disponível", "available") : T("ausente", "missing")}</li>;
              })}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

function build(candidate, siteVec, extra, site, purpose, data) {
  return evidenceFor({ siteVec, cell: candidate, extra, body: site.body, purpose, data, origin: "derived" });
}
