import { LayersIcon, MountainIcon, TargetIcon } from "../ui/Icons.jsx";

const FEATURES = [
  { icon: <MountainIcon />, label: "Análise de terrenos" },
  { icon: <LayersIcon />, label: "Dados geoespaciais" },
  { icon: <TargetIcon />, label: "Similaridade explicável" },
];

export default function FeatureList() {
  return (
    <ul className="m-0 mt-10 grid max-w-[340px] list-none gap-3.5 p-0">
      {FEATURES.map((f) => (
        <li key={f.label} className="flex items-center gap-5 rounded-full border border-line bg-petrol-950/30 px-5 py-3 text-sm font-medium uppercase tracking-wide">
          <span className="flex-none text-gold">{f.icon}</span>{f.label}
        </li>
      ))}
    </ul>
  );
}
