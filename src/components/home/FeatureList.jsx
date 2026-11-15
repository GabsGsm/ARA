// As três chamadas da página inicial (ícones da arte de referência).
const FEATURES = [
  {
    label: "Análise de terrenos",
    icon: (
      <svg viewBox="0 0 46 30" aria-hidden="true">
        <path d="M2 27 L16 6 L24 17 L30 10 L44 27 Z" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M8 21 C14 17 20 22 26 18 S36 17 40 21" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
  {
    label: "Dados geoespaciais",
    icon: (
      <svg viewBox="0 0 34 32" aria-hidden="true">
        <path d="M17 3 L31 10 L17 17 L3 10 Z" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
        <path d="M3 16 L17 23 L31 16 M3 22 L17 29 L31 22" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    // O ranking é uma distância ponderada explicável, não um modelo treinado (ver relatório da equipe),
    // por isso o texto é "Similaridade explicável" e o ícone é um alvo.
    label: "Similaridade explicável",
    icon: (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="2.6" />
        <circle cx="16" cy="16" r="7" fill="none" stroke="currentColor" strokeWidth="2.2" />
        <circle cx="16" cy="16" r="2.2" fill="currentColor" />
      </svg>
    ),
  },
];

export default function FeatureList() {
  return (
    <ul className="features">
      {FEATURES.map((f, i) => (
        <li key={f.label} className="reveal" style={{ "--d": `${0.7 + i * 0.1}s` }}>{f.icon}{f.label}</li>
      ))}
    </ul>
  );
}
