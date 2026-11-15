import Card, { PageHeader } from "../components/ui/Card.jsx";
import StatusChip from "../components/ui/StatusChip.jsx";
import { useTr } from "../hooks/useSettings.jsx";

export default function About() {
  const tr = useTr();
  return (
    <section aria-labelledby="abTitle" className="mx-auto max-w-[1640px] px-[clamp(12px,2vw,30px)] pt-8">
      <PageHeader title={<span id="abTitle">{tr("Sobre")}</span>} lead="ARA — Analog Research & Analysis. NASA Space Apps Challenge 2026." />
      <div className="grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(min(380px,100%),1fr))]">
        <Card as="article" title="O que é" titleId="ab1">
          <p className="text-[13px] text-ink-2">
            {tr("O ARA compara locais fixos de exploração em Marte (setores da cratera Jezero) e na Lua (regiões candidatas do Artemis III) com uma grade de células de 5 × 5 km da Terra. Ele mostra o que torna cada lugar análogo, o que não torna e onde faltam dados — não existe relação de 1 para 1. Também deixa testar os dados (Laboratório), planejar e dirigir rovers sobre o relevo real (Missão) e proteger zonas científicas.", "ARA compares fixed exploration sites on Mars (Jezero crater sectors) and the Moon (Artemis III candidate regions) with a grid of 5 × 5 km cells on Earth. It shows what makes each place analogous, what does not, and where data is missing — there is no one-to-one match. It also lets you test the data (Data lab), plan and drive rovers on real terrain (Mission) and protect science zones.")}
          </p>
        </Card>
        <Card as="article" title="Como ler um resultado" titleId="ab2">
          <ul className="m-0 grid list-none gap-2 p-0 text-[13px]">
            <li><StatusChip status="analog" /> {tr("diferença pequena naquela dimensão")}</li>
            <li><StatusChip status="partial" /> {tr("diferença moderada")}</li>
            <li><StatusChip status="not_analog" /> {tr("diferença grande ou impossível na Terra")}</li>
            <li><StatusChip status="no_data" /> {tr("a dimensão ainda não foi medida")}</li>
          </ul>
        </Card>
        <Card as="article" title="Limitações" titleId="ab3">
          <p className="text-[13px] text-ink-2">
            {tr("Três estatísticas de relevo não descrevem orientação das encostas, drenagem nem textura em várias escalas. Pesos e escalas não foram calibrados por especialistas. Os DEMs da Terra e dos planetas vêm de instrumentos diferentes. Litologia mapeada não é mineralogia verificada, e os indicadores do M3 na Lua são exploratórios.", "Three relief statistics do not describe slope orientation, drainage or multi-scale texture. Weights and scales were not calibrated by experts. Earth and planetary DEMs come from different instruments. Mapped lithology is not verified mineralogy, and the Moon M3 indicators are exploratory.")}
          </p>
        </Card>
      </div>
    </section>
  );
}
