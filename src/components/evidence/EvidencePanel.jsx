// Painel de evidências de um candidato: finalidade da missão, cartões (favorável / diferença / ausente / contexto),
// "O que o ranking não mostra?" (Analog Mirage), "O que falta saber?" (Next Best Measurement), cobertura dos
// dados e a ficha exportável (Analog Passport).
import { useMemo, useState } from "react";
import { ORIGIN, PURPOSES, RELATION, downloadJSON, evidenceFor, mirage, nextBest, passport, tally, targetEvidence } from "../../lib/evidence/engine.js";
import { fmt } from "../../lib/format.js";

const GROUP_ORDER = ["Relevo", "Superfície", "Estabilidade", "Solo", "Geologia", "Mineralogia", "Ambiente", "Alvo"];

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
        <span className="ev-val">{val}{e.target != null && <small> alvo {fmt(e.target, 1)}</small>}</span>
      </button>
      {open && (
        <div className="ev-more">
          {e.rule && <p><b>Regra:</b> {e.rule}</p>}
          {e.detail?.length > 0 && <ul>{e.detail.map((d) => <li key={d}>{d}</li>)}</ul>}
          <p className="ev-prov">
            <b>Fonte:</b> {e.source}{e.resolution_m ? ` · ${fmt(e.resolution_m, 0)} m` : ""}{e.period ? ` · ${e.period}` : ""}{e.method ? ` · ${e.method}` : ""}
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
  const groups = GROUP_ORDER.map((g) => [g, list.filter((e) => e.group === g)]).filter(([, l]) => l.length);
  const cmp = useMemo(() => (compare ? build(compare.candidate, siteVec, compare.extra, site, purpose, data) : null), [compare, siteVec, site, purpose, data]);

  const exportPassport = () => downloadJSON(passport({
    candidate, site, purpose, objective, weights, list: [...list, ...target], distance, rankInfo, data, sourcesMeta,
  }), `ARA_passport_${site.id}_${candidate.id}.json`);

  const VERDICT = {
    mirage: { cls: "bad", title: "Possível falso análogo", text: "O relevo passa no ranking, mas há evidência contrária para esta finalidade." },
    topo_differs: { cls: "warn", title: "O relevo já difere", text: "Pelo menos uma das três medidas fica fora do limite do ARA." },
    undetermined: { cls: "none", title: "Faltam dados para decidir", text: "Relevo parecido, mas várias evidências estão ausentes." },
    consistent: { cls: "ok", title: "Coerente com o ranking", text: "Relevo parecido e nenhuma evidência contrária nos dados disponíveis." },
  }[m.verdict];

  return (
    <div className="ev-panel">
      <div className="ev-top">
        <label className="ev-purpose">
          <span>Finalidade do análogo</span>
          <select className="field" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            {Object.entries(PURPOSES).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
          </select>
        </label>
        <div className="ev-tally" aria-label="Resumo das evidências">
          <span className="ok">{t.supporting} favoráveis</span>
          <span className="bad">{t.contradictory} diferenças</span>
          <span className="none">{t.unknown} sem dado</span>
          <span className="info">{t.not_applicable} contexto</span>
        </div>
        <button type="button" className="ev-export" onClick={exportPassport}>Exportar ficha (Analog Passport) ↓</button>
      </div>
      {exploratory && <p className="ev-explor">Comparação exploratória: diferenças de resolução e processamento podem limitar a equivalência com o catálogo.</p>}

      <div className="ev-grid">
        <section aria-label="Evidências">
          {groups.map(([g, l]) => (
            <div key={g} className="ev-group">
              <h4>{g}</h4>
              <ul>{l.map((e) => <Card key={e.id} e={e} open={openId === e.id} onToggle={() => setOpenId(openId === e.id ? null : e.id)} />)}</ul>
            </div>
          ))}
          <div className="ev-group">
            <h4>Alvo: {site.name}</h4>
            <ul>{target.slice(0, showAll ? 99 : 3).map((e) => <Card key={e.id} e={e} open={openId === e.id} onToggle={() => setOpenId(openId === e.id ? null : e.id)} />)}</ul>
            {target.length > 3 && <button type="button" className="ev-link" onClick={() => setShowAll((v) => !v)}>{showAll ? "Mostrar menos" : `Mais ${target.length - 3}`}</button>}
          </div>
        </section>

        <section aria-label="Decisão">
          <div className={`ev-verdict ${VERDICT.cls}`}>
            <h4>O que o ranking não mostra?</h4>
            <b>{VERDICT.title}</b>
            <p>{VERDICT.text}</p>
            {m.against.length > 0 && <p className="mt-1"><b>Contra:</b> {m.against.map((e) => e.parameter).join(", ")}.</p>}
            {cmp && (
              <div className="ev-cmp">
                <small>Comparação com {compare.candidate.name}:</small>
                <table className="data-table m-0">
                  <thead><tr><th /><th>{candidate.name}</th><th>{compare.candidate.name}</th></tr></thead>
                  <tbody>
                    {["supporting", "contradictory", "unknown"].map((k) => (
                      <tr key={k}><th scope="row">{RELATION[k].label}</th><td>{tally(list)[k]}</td><td>{tally(cmp)[k]}</td></tr>
                    ))}
                    <tr><th scope="row">Veredito</th><td>{mirage(list).verdict === "mirage" ? "falso análogo?" : mirage(list).verdict === "consistent" ? "coerente" : "incerto"}</td>
                      <td>{mirage(cmp).verdict === "mirage" ? "falso análogo?" : mirage(cmp).verdict === "consistent" ? "coerente" : "incerto"}</td></tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="ev-nbm">
            <h4>{PURPOSES[purpose].question}</h4>
            <div className="ev-cols">
              <div>
                <b className="ok">Sabemos</b>
                <ul>{nb.known.map((k) => <li key={k.attr}>{k.attr}: {k.measure}</li>)}{!nb.known.length && <li>Nada sólido ainda.</li>}</ul>
              </div>
              <div>
                <b className="warn">Falta verificar</b>
                <ul>{nb.missing.map((k) => <li key={k.attr}>{k.attr} <small>({k.criticality === "essential" ? "essencial" : "útil"})</small></li>)}{!nb.missing.length && <li>Nada essencial pendente.</li>}</ul>
              </div>
              <div className="ev-next">
                <b className="gold">Próximo ensaio</b>
                {nb.next ? <><p>{nb.next.measure}</p>{nb.next.decision && <small>Ajuda a decidir: {nb.next.decision}</small>}</> : <p>Nenhum pendente nas regras atuais.</p>}
              </div>
            </div>
            <p className="ev-caveat">Recomendação por regras explícitas da equipe — não é medição realizada nem probabilidade calibrada.</p>
          </div>

          <div className="ev-coverage">
            <h4>Cobertura dos dados</h4>
            <ul>
              {list.filter((e, i, a) => a.findIndex((x) => x.group === e.group) === i && e.group !== "Relevo").map((e) => {
                const has = list.some((x) => x.group === e.group && x.origin !== "unavailable");
                return <li key={e.group} className={has ? "has" : "no"}><span aria-hidden="true">{has ? "■" : "▨"}</span>{e.group}: {has ? "disponível" : "ausente"}</li>;
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
