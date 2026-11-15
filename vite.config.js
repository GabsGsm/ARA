// ARA — Vite + React + Tailwind
//   npm run dev    -> http://localhost:5173 (lê data/ direto da raiz do projeto)
//   npm run build  -> gera web/ (pasta publicada no GitHub Pages) e copia data/ para web/data/
import { cpSync, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const ROOT = import.meta.dirname;
const DATA = resolve(ROOT, "data");
const OUT = resolve(ROOT, "web");
const SKIP = ["source", "runs"]; // ficam no repositório, não vão para o site
const TYPES = { ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };

function araData() {
  return {
    name: "ara-data",
    configureServer(server) {
      server.middlewares.use("/data", (req, res, next) => {
        const file = normalize(join(DATA, decodeURIComponent(req.url.split("?")[0])));
        if (!file.startsWith(DATA) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
        res.setHeader("Cache-Control", "no-store");
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      cpSync(DATA, join(OUT, "data"), {
        recursive: true,
        filter: (src) => !SKIP.some((s) => normalize(src).startsWith(join(DATA, s))),
      });
    },
  };
}

export default defineConfig({
  root: "src",
  base: "./", // caminhos relativos: funciona em gabsgsm.github.io/ARA/
  publicDir: "public",
  plugins: [react(), tailwindcss(), araData()],
  build: { outDir: OUT, emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: { open: true },
});
