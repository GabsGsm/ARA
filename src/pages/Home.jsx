import { Link } from "react-router-dom";
import FeatureList from "../components/home/FeatureList.jsx";
import Planet from "../components/home/Planet.jsx";
import { MoonIcon, MountainIcon, Sparkle } from "../components/ui/Icons.jsx";
import { useAraData } from "../hooks/useAraData.jsx";

export default function Home() {
  const data = useAraData();
  const globes = data.status === "ready" ? data.config.globes ?? {} : {};
  return (
    <section aria-labelledby="heroTitle" className="relative min-h-[calc(100vh-90px)] overflow-hidden px-[clamp(12px,2vw,30px)] pt-6">
      <div className="frame-corners grid min-h-[min(78vh,760px)] items-center gap-2.5 px-[clamp(18px,3.5vw,56px)] pb-24 pt-[clamp(26px,4vw,56px)] lg:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.5fr)]">
        <div className="min-w-0">
          <h1 id="heroTitle" className="display text-[clamp(40px,5.4vw,76px)]">
            Explore<br />beyond<br /><span className="text-glow text-gold">Earth.</span>
          </h1>
          <span aria-hidden="true" className="my-6 block h-[5px] w-[58px] rounded bg-gold" />
          <p className="lead">Encontre na Terra ambientes semelhantes aos de Marte e da Lua.</p>
          <FeatureList />
        </div>

        <div className="relative grid min-w-0 grid-cols-[1.15fr_1fr] items-end gap-[clamp(12px,4vw,70px)] pt-5 max-lg:mt-8">
          <svg viewBox="0 0 900 520" preserveAspectRatio="none" aria-hidden="true"
               className="orbit-glow pointer-events-none absolute -left-[8%] -top-[6%] h-[88%] w-[112%]">
            <ellipse cx="470" cy="260" rx="440" ry="150" fill="none" stroke="#f2b53a" strokeWidth="2" opacity=".9" transform="rotate(-14 470 260)" />
          </svg>
          <Sparkle className="absolute right-[6%] top-0 h-7 w-7" />
          <Sparkle className="absolute bottom-[22%] left-[2%] h-5 w-5" />
          <Planet body="mars" label="Marte" to="/explorar?corpo=marte" gold icon={<MountainIcon />}
                  textureUrl={globes.mars} sizeClass="w-[min(100%,430px)]" />
          <Planet body="moon" label="Lua" to="/explorar?corpo=lua" icon={<MoonIcon />}
                  textureUrl={globes.moon} sizeClass="w-[min(82%,360px)]" />
        </div>
        <Link to="/explorar" aria-label="Ir para Explorar"
              className="absolute bottom-4 left-1/2 h-11 w-7 -translate-x-1/2 rounded-[14px] border-2 border-ink-2">
          <span className="scroll-dot absolute left-1/2 top-2.5 -ml-0.5 h-2 w-1 rounded bg-ink" />
        </Link>
      </div>
      <div className="horizon" aria-hidden="true" />
    </section>
  );
}
