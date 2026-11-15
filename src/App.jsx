import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import Header from "./components/layout/Header.jsx";
import Footer from "./components/layout/Footer.jsx";
import Sky from "./components/fx/Sky.jsx";
import Home from "./pages/Home.jsx";
import Explore from "./pages/Explore.jsx";
import Analyses from "./pages/Analyses.jsx";
import About from "./pages/About.jsx";

import { useAraData } from "./hooks/useAraData.jsx";

// o 3D (three.js) só é baixado quando alguém abre a página
const Lab3D = lazy(() => import("./pages/Lab3D.jsx"));
const Field = lazy(() => import("./pages/Field.jsx"));
const Vehicles = lazy(() => import("./pages/Vehicles.jsx"));
const Mission = lazy(() => import("./pages/Mission.jsx"));
const DataLab = lazy(() => import("./pages/DataLab.jsx"));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [pathname]);
  return null;
}

export default function App() {
  const data = useAraData();
  const { pathname } = useLocation();
  return (
    <>
      <a href="#conteudo" className="skip" onClick={(e) => { e.preventDefault(); document.getElementById("conteudo")?.focus(); }}>
        Pular para o conteúdo
      </a>
      <Sky />
      <Header />
      <ScrollToTop />
      <main id="conteudo" tabIndex={-1} className="outline-none">
        {data.status === "loading" && <p className="note p-8" role="status">Carregando dados…</p>}
        {data.status === "error" && (
          <p role="alert" className="m-5 rounded-2xl border border-bad bg-bad/10 px-4 py-3">
            {data.error}. Rode <code>npm run dev</code> na raiz do projeto (ele serve a pasta <code>data/</code>).
          </p>
        )}
        {data.status === "ready" && (
          <div key={pathname} className={pathname === "/" ? undefined : "page-enter"}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/explorar" element={<Explore />} />
            <Route path="/analises" element={<Analyses />} />
            <Route path="/3d" element={<Suspense fallback={<p className="note p-8" role="status">Carregando o laboratório 3D…</p>}><Lab3D /></Suspense>} />
            <Route path="/campo" element={<Suspense fallback={<p className="note p-8" role="status">Carregando o modo de campo…</p>}><Field /></Suspense>} />
            <Route path="/laboratorio" element={<Suspense fallback={<p className="note p-8" role="status">Carregando o laboratório…</p>}><DataLab /></Suspense>} />
            <Route path="/missao" element={<Suspense fallback={<p className="note p-8" role="status">Carregando a missão…</p>}><Mission /></Suspense>} />
            <Route path="/veiculos" element={<Suspense fallback={<p className="note p-8" role="status">Carregando os veículos…</p>}><Vehicles /></Suspense>} />
            <Route path="/sobre" element={<About />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
