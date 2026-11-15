// O caminho do ARA em quatro passos — cada um leva à página que faz aquilo (sem funções repetidas).
import { Link } from "react-router-dom";

const STEPS = [
  { to: "/explorar", label: "Encontrar o análogo", sub: "Ranking explicável de 522 lugares da Terra" },
  { to: "/3d", label: "Comparar em 3D", sub: "Relevo real, lado a lado, com Sol e sombras" },
  { to: "/laboratorio", label: "Testar os dados", sub: "Até onde o dado sustenta a semelhança" },
  { to: "/missao", label: "Planejar a missão", sub: "Dirija um rover sobre o relevo real" },
];

export default function FeatureList() {
  return (
    <nav aria-label="Como usar o ARA">
      <ol className="features">
        {STEPS.map((s, i) => (
          <li key={s.to} className="reveal" style={{ "--d": `${0.7 + i * 0.1}s` }}>
            <Link to={s.to}>
              <span className="num" aria-hidden="true">{i + 1}</span>
              <span className="txt"><b>{s.label}</b><small>{s.sub}</small></span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
