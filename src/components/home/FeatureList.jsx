// O caminho do ARA em quatro passos — cada um leva à página que faz aquilo (sem funções repetidas).
import { Link } from "react-router-dom";
import { useTr } from "../../hooks/useSettings.jsx";

const STEPS = [
  { to: "/explorar", label: ["Encontrar o análogo", "Find the analog"], sub: ["Ranking explicável de 710 lugares da Terra", "Explainable ranking of 710 places on Earth"] },
  { to: "/3d", label: ["Comparar em 3D", "Compare in 3D"], sub: ["Relevo real, lado a lado, com Sol e sombras", "Real relief, side by side, with Sun and shadows"] },
  { to: "/laboratorio", label: ["Testar os dados", "Test the data"], sub: ["Até onde o dado sustenta a semelhança", "How far the data supports the similarity"] },
  { to: "/missao", label: ["Planejar a missão", "Plan the mission"], sub: ["Dirija um rover sobre o relevo real", "Drive a rover on real terrain"] },
];

export default function FeatureList() {
  const tr = useTr();
  return (
    <nav aria-label={tr("Como usar o ARA", "How to use ARA")}>
      <ol className="features">
        {STEPS.map((s, i) => (
          <li key={s.to} className="reveal" style={{ "--d": `${0.7 + i * 0.1}s` }}>
            <Link to={s.to}>
              <span className="num" aria-hidden="true">{i + 1}</span>
              <span className="txt"><b>{tr(...s.label)}</b><small>{tr(...s.sub)}</small></span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
