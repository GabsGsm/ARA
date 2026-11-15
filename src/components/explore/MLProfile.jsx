// Perfil topográfico por aprendizado de máquina (K-Means, expansão 710 células): experimental e separado do ranking.
// Mostra em qual grupo de relevo caem o local da missão e a célula da Terra. Os IDs dos grupos são arbitrários;
// o nome vem dos centros físicos (relevo suave × relevo acidentado), não de um rótulo de "análogo".
import { useEffect, useState } from "react";
import { dataUrl, fmt } from "../../lib/format.js";
import { T } from "../../lib/i18n.js";

let cache = null;
export function useML() {
  const [ml, setMl] = useState(cache);
  useEffect(() => {
    if (cache) return undefined;
    let alive = true;
    fetch(dataUrl("data/ml/ml_710.json")).then((r) => (r.ok ? r.json() : null)).then((d) => { cache = d; if (alive) setMl(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return ml;
}

/** Nome do grupo pelos centros físicos: o de maior amplitude é "acidentado". */
export function groupName(model, g) {
  const centers = model.centers_physical, reliefIdx = model.features.indexOf("relief_m");
  const order = centers.map((c, i) => [c[reliefIdx], i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const rank = order.indexOf(g);
  return rank === 0 ? T("relevo suave", "gentle relief") : rank === order.length - 1 ? T("relevo acidentado", "rugged relief") : T("relevo intermediário", "intermediate relief");
}

export default function MLProfile({ siteId, cellId }) {
  const ml = useML();
  if (!ml) return null;
  const m3 = ml.models["3_atributos"], m5 = ml.models["5_atributos"];
  const pg = ml.planet[siteId], cg = ml.cells[cellId];
  const row = (label, model, p, c) => {
    const same = p != null && c != null && p === c;
    return (
      <tr>
        <th scope="row">{label}</th>
        <td>{p == null ? "—" : groupName(model, p)}</td>
        <td>{c == null ? T("sem grupo", "no group") : groupName(model, c)}</td>
        <td><span className={`ml-chip ${c == null ? "none" : same ? "ok" : "bad"}`}>{c == null ? T("sem dado", "no data") : same ? T("mesmo perfil", "same profile") : T("perfis diferentes", "different profiles")}</span></td>
      </tr>
    );
  };
  return (
    <section className="ml-box" aria-labelledby="mlTitle">
      <h4 id="mlTitle" className="eyebrow mb-1">{T("Perfil de relevo por aprendizado de máquina", "Relief profile by machine learning")} <span className="ml-exp">{T("experimental", "experimental")}</span></h4>
      <p className="note m-0">{T(`K-Means não supervisionado treinado em ${ml.training_cells} células da Terra (expansão com Holuhraun, Mauna Kea e Erg Chebbi). Não altera o ranking: só diz se os dois lugares caem no mesmo grupo de relevo.`, `Unsupervised K-Means trained on ${ml.training_cells} Earth cells (expansion with Holuhraun, Mauna Kea and Erg Chebbi). It does not change the ranking: it only says whether both places fall into the same relief group.`)}</p>
      <table className="data-table mt-2">
        <thead><tr><th>{T("Modelo", "Model")}</th><th>{T("Local da missão", "Mission site")}</th><th>{T("Célula da Terra", "Earth cell")}</th><th /></tr></thead>
        <tbody>
          {row(T("3 atributos", "3 attributes"), m3, pg?.["3_atributos"]?.group, cg?.[0])}
          {row(T("5 atributos", "5 attributes"), m5, pg?.["5_atributos"]?.group, cg?.[1])}
        </tbody>
      </table>
      <p className="note mt-2 mb-0">{T("Centros dos grupos (3 atributos)", "Group centres (3 attributes)")}: {m3.centers_physical.map((c, i) => `${groupName(m3, i)} ≈ ${fmt(c[0], 1)}° · ${fmt(c[1], 1)} m · ${fmt(c[2], 0)} m`).join(" | ")}. Silhouette {fmt(m3.silhouette, 2)} · ARI {fmt(m3.ari_vs_518, 2)} {T("contra o modelo de 518 células", "against the 518-cell model")}. {T("Silhouette e ARI medem a separação dos grupos, não equivalência geológica.", "Silhouette and ARI measure group separation, not geological equivalence.")}</p>
    </section>
  );
}
