// Configurações: idioma e acessibilidade, num só lugar.
import { useHighContrast } from "../hooks/useHighContrast.js";
import { useMotion } from "../hooks/useMotion.jsx";
import { useSettings } from "../hooks/useSettings.jsx";
import { canSound, canSpeak, sonify, speak } from "../lib/a11y/sense.js";

function Row({ title, desc, children }) {
  return (
    <div className="st-row">
      <div><b>{title}</b>{desc && <small>{desc}</small>}</div>
      <div className="st-ctl">{children}</div>
    </div>
  );
}
function Switch({ on, onChange, label }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="st-switch" onClick={() => onChange(!on)}><span /></button>;
}

export default function Settings() {
  const s = useSettings(), tr = s.tr;
  const [hc, toggleHc] = useHighContrast();
  const { calm, toggleCalm } = useMotion();
  return (
    <section aria-labelledby="stTitle" className="mx-auto max-w-[900px] px-[clamp(12px,2vw,30px)] pt-6 pb-12">
      <p className="eyebrow mb-1">{tr("Preferências", "Preferences")}</p>
      <h1 id="stTitle" className="st-title">{tr("Configurações", "Settings")}</h1>
      <p className="desc">{tr("Ficam salvas neste navegador. Nada é enviado a servidores.", "Saved in this browser only. Nothing is sent to any server.")}</p>

      <div className="card st-card">
        <h2 className="st-h">{tr("Idioma", "Language")}</h2>
        <Row title={tr("Idioma do site", "Site language")} desc={tr("Português ou inglês. Nomes de lugares e de dados científicos não são traduzidos.", "Portuguese or English. Place names and dataset names are not translated.")}>
          <div className="st-seg" role="radiogroup" aria-label={tr("Idioma", "Language")}>
            <button type="button" role="radio" aria-checked={s.lang === "pt"} onClick={() => s.set("lang", "pt")}>Português</button>
            <button type="button" role="radio" aria-checked={s.lang === "en"} onClick={() => s.set("lang", "en")}>English</button>
          </div>
        </Row>
      </div>

      <div className="card st-card">
        <h2 className="st-h">{tr("Visão", "Vision")}</h2>
        <Row title={tr("Tamanho do texto", "Text size")} desc={`${s.font}%`}>
          <div className="st-seg">
            {[90, 100, 115, 130].map((f) => <button key={f} type="button" aria-pressed={s.font === f} onClick={() => s.set("font", f)}>{f}%</button>)}
          </div>
        </Row>
        <Row title={tr("Alto contraste", "High contrast")} desc={tr("Fundo preto, texto branco, sem brilhos.", "Black background, white text, no glows.")}><Switch on={hc} onChange={toggleHc} label={tr("Alto contraste", "High contrast")} /></Row>
        <Row title={tr("Cores seguras para daltonismo", "Colour-blind safe palette")} desc={tr("Troca verde/vermelho por azul/laranja nos status e mapas de risco.", "Replaces green/red with blue/orange in status chips and risk maps.")}><Switch on={s.colorblind} onChange={(v) => s.set("colorblind", v)} label="cb" /></Row>
        <Row title={tr("Leitura facilitada", "Easier reading")} desc={tr("Mais espaço entre letras, palavras e linhas (ajuda pessoas com dislexia).", "More letter, word and line spacing (helps people with dyslexia).")}><Switch on={s.dyslexia} onChange={(v) => s.set("dyslexia", v)} label="easy" /></Row>
        <Row title={tr("Sublinhar links", "Underline links")}><Switch on={s.underline} onChange={(v) => s.set("underline", v)} label="links" /></Row>
      </div>

      <div className="card st-card">
        <h2 className="st-h">{tr("Movimento e som", "Motion and sound")}</h2>
        <Row title={tr("Pausar animações", "Pause animations")} desc={tr("Planetas, órbitas e voos de câmera ficam parados.", "Planets, orbits and camera flights stay still.")}><Switch on={calm} onChange={toggleCalm} label="calm" /></Row>
        <Row title={tr("Narração", "Narration")} desc={tr("Botões para ouvir descrições e resultados (voz do próprio navegador).", "Buttons to hear descriptions and results (your browser's own voice).")}>
          <Switch on={s.narration} onChange={(v) => s.set("narration", v)} label="narration" />
          {canSpeak() && <button type="button" className="st-test" onClick={() => speak(tr("Olá! Esta é a narração do ARA.", "Hello! This is ARA narration."), s.lang)}>{tr("Testar", "Test")}</button>}
        </Row>
        <Row title={tr("Sons do relevo e alertas", "Terrain sounds and alerts")} desc={tr("Sonificação de perfis e avisos sonoros na missão.", "Profile sonification and audio alerts in the mission.")}>
          <Switch on={s.sounds} onChange={(v) => s.set("sounds", v)} label="sounds" />
          {canSound() && <button type="button" className="st-test" onClick={() => sonify([{ values: [0, 2, 5, 9, 6, 3, 8, 12, 10, 4, 1] }], { dur: 1.6 })}>{tr("Testar", "Test")}</button>}
        </Row>
      </div>

      <div className="card st-card">
        <h2 className="st-h">{tr("Teclado", "Keyboard")}</h2>
        <ul className="st-keys">
          <li><kbd>Tab</kbd> {tr("percorre todos os controles", "moves through every control")}</li>
          <li><kbd>W A S D</kbd> / <kbd>←↑→↓</kbd> {tr("dirige o rover na Missão e caminha no 3D", "drives the rover in Mission and walks in 3D")}</li>
          <li><kbd>C</kbd> {tr("troca a câmera na Missão", "switches camera in Mission")} · <kbd>{tr("espaço", "space")}</kbd> {tr("freia", "brakes")}</li>
          <li><kbd>Esc</kbd> {tr("fecha menus e sai do modo caminhar", "closes menus and leaves walk mode")}</li>
        </ul>
      </div>
      <button type="button" className="st-reset" onClick={s.reset}>{tr("Restaurar padrões", "Restore defaults")}</button>
    </section>
  );
}
