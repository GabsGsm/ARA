import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "@fontsource/michroma/400.css";
import "@fontsource/lexend/300.css";
import "@fontsource/lexend/400.css";
import "@fontsource/lexend/500.css";
import "@fontsource/lexend/600.css";
import "leaflet/dist/leaflet.css";
import "./assets/css/ara.css";
import "./assets/css/home.css";
import App from "./App.jsx";
import { AraDataProvider } from "./hooks/useAraData.jsx";
import { ExplorerProvider } from "./hooks/useExplorer.jsx";
import { MotionProvider } from "./hooks/useMotion.jsx";

// HashRouter: as rotas (#/explorar) funcionam no GitHub Pages sem configurar 404/redirect.
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <HashRouter>
      <MotionProvider>
        <AraDataProvider>
          <ExplorerProvider>
            <App />
          </ExplorerProvider>
        </AraDataProvider>
      </MotionProvider>
    </HashRouter>
  </StrictMode>,
);
