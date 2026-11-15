// Testes da lógica do front.  Rodar:  node tests/test_core.mjs
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { unpackGrid, rank, distance, contributions, explain, scalesFrom, normalizeWeights, cellsForVariant } from "../src/lib/core.js";
import { localizeData, setLang, T } from "../src/lib/i18n.js";
import { ROVERS, startState, steerForWarp, step, withinTargetRadius } from "../src/lib/mission/rover.js";

const root = new URL("../", import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
const config = read("data/config.json");
const grid = read("data/earth_grid.json");
const sites = read("data/planet_sites.json");
const proto = read("data/source/prototipo1_app_data.json");

// Os testes conferem a matemática contra os números do Protótipo 1 e da entrega da equipe,
// então usam só as 4 células do protótipo (p1_*). A grade nova (522+ células) pode — e deve —
// achar células mais parecidas; isso é descoberta, não erro.
const allCells = unpackGrid(grid);
const cells = allCells.filter((c) => c.id.startsWith("p1_"));
assert.equal(cells.length, 4, "as 4 células do Protótipo 1 precisam continuar na grade");
const scales = scalesFrom(config);
const w = normalizeWeights(config.objectives.default.weights);

// 1) distâncias e contribuições iguais ao Protótipo 1 (16 pares)
for (const r of proto.ranking) {
  const site = sites[r.setor_marte.toLowerCase()].terrain;
  const cell = cells.find((c) => c.id === "p1_" + r.candidato_terra.toLowerCase());
  assert.ok(Math.abs(distance(site, cell, w, scales) - r.distancia_topografica) < 1e-6, `${r.setor_marte} x ${r.candidato_terra}`);
  const ctb = contributions(site, cell, w, scales);
  assert.ok(Math.abs(ctb.slope_mean_deg - r.contrib_declividade_pct) < 1e-3);
}

// 2) ranking igual ao Protótipo 1
for (const sid of ["jezero_01", "jezero_02", "jezero_03", "jezero_04"]) {
  const got = rank(sites[sid].terrain, cells, config.objectives.default.weights, scales, 4).map((r) => r.cell.id);
  const want = proto.ranking.filter((r) => r.setor_marte.toLowerCase() === sid)
    .sort((a, b) => a.posicao - b.posicao).map((r) => "p1_" + r.candidato_terra.toLowerCase());
  assert.deepEqual(got, want, sid);
}

// 3) trocar o objetivo muda o ranking de Jezero 04 (Wadi Rum x Death Valley quase empatados)
const rover = rank(sites.jezero_04.terrain, cells, config.objectives.rover.weights, scales, 1)[0].cell.id;
const land = rank(sites.jezero_04.terrain, cells, config.objectives.landscape.weights, scales, 1)[0].cell.id;
console.log("Jezero 04, 1º lugar  rover:", rover, "| landscape:", land);

// 4) explicação por dimensão inclui limites fixos e 'sem dado'
const dims = explain(sites.jezero_02, cells[0], config);
// a grade completa ranqueia sem erro
assert.ok(rank(sites.jezero_01.terrain, allCells, config.objectives.default.weights, scales, 10).length >= 4);
assert.ok(dims.some((d) => d.status === "no_data"));
assert.equal(dims.filter((d) => d.attr === "limit").length, 3);

// 5) variante de simulação sem dados não quebra
assert.equal(cellsForVariant(cells, "res_300", { earth: {} }).length, 0);

console.log("core.js: todos os testes passaram");

// 6) entrega de classificação da equipe (data/source/classification):
//    Marte deve bater exatamente; Lua difere só porque a declividade lunar foi
//    recalculada com terrain.py (a entrega excluía a borda), mas a ordem dos 4 candidatos é a mesma.
{
  const csv = (f) => readFileSync(new URL("data/source/classification/" + f, root), "utf8")
    .replace(/^﻿/, "").trim().split(/\r?\n/).slice(1).map((l) => l.split(","));
  for (const [f, tol] of [["ara_ranking_marte_terra_validado.csv", 1e-6], ["ara_ranking_lua_terra.csv", 0.02]]) {
    const rows = csv(f);
    for (const sid of new Set(rows.map((r) => r[0]))) {
      const ours = rank(sites[sid].terrain, cells, w, scales, 10);
      const theirs = rows.filter((r) => r[0] === sid).sort((a, b) => a[2] - b[2]);
      assert.deepEqual(ours.map((r) => r.cell.id.replace(/^p1_/, "")), theirs.map((r) => r[1]), `ordem ${sid}`);
      theirs.forEach((r) => {
        const d = ours.find((o) => o.cell.id === "p1_" + r[1]).d;
        assert.ok(Math.abs(d - Number(r[3])) <= tol, `${sid}/${r[1]}: ${d} vs ${r[3]}`);
      });
    }
  }
  console.log("Entrega de classificação: Marte idêntico (16), Lua mesma ordem (16)");
}

// 7) textos longos vindos dos dados seguem o idioma selecionado e nunca desaparecem.
{
  const caveat = "Água detectada pelo Landsat entre 1984 e 2021; não cobre depois de 2021 nem umidade do solo.​";
  setLang("en");
  assert.equal(T(caveat), "Water detected by Landsat between 1984 and 2021; does not cover after 2021 or soil moisture.");
  assert.equal(localizeData({ caveats: [caveat] }).caveats[0], "Water detected by Landsat between 1984 and 2021; does not cover after 2021 or soil moisture.");
  setLang("pt");
  assert.equal(T(caveat), caveat);
}

// 8) o warp acelera o deslocamento, mas não deixa a direção girar sem controle
{
  const spec = ROVERS.perseverance;
  const scene = { meta: { size_m: 100 }, body: { g: 3.721 }, n: 4, heights: new Float32Array(16) };
  const env = { scene, soft: () => 0.3, sunlit: () => true, hits: new Set(), rocks: () => [] };
  const state = startState(spec, { u: 0.5, v: 0.5 });
  const slow = step(state, spec, { throttle: 0, steer: 1 }, 9, env);
  const fast = step(state, spec, { throttle: 0, steer: steerForWarp(1, 60) }, 180, env);
  assert.ok(Math.abs(fast.heading - slow.heading) < 1e-12);
  assert.equal(steerForWarp(1, 1000), 0.003);
}

// 9) só considera a chegada quando o percurso cruza a vizinhança curta do destino
{
  const target = { u: 0.5, v: 0.5 };
  assert.equal(withinTargetRadius({ u: 0.4, v: 0.5 }, { u: 0.6, v: 0.5 }, target, 2, 100), true);
  assert.equal(withinTargetRadius({ u: 0.4, v: 0.5 }, { u: 0.45, v: 0.5 }, target, 2, 100), false);
}

// 10) pedras ao lado do LRV não causam desgaste; contato real continua contando
{
  const spec = ROVERS.lrv;
  const scene = { meta: { size_m: 100 }, body: { g: 1.62 }, n: 4, heights: new Float32Array(16) };
  const makeEnv = (rock) => ({ scene, soft: () => 0.3, sunlit: () => true, hits: new Set(), rocks: () => [rock] });
  const rock = { id: "edge", x: 1.35, z: 0, d: 0.5, h: 0.3 };
  const clear = step(startState(spec, { u: 0.5, v: 0.5 }), spec, { throttle: 1, steer: 0 }, 0.05, makeEnv(rock));
  assert.equal(clear.wheel, 0);
  const chassis = step(startState(spec, { u: 0.5, v: 0.5 }), spec, { throttle: 1, steer: 0 }, 0.05,
    makeEnv({ ...rock, id: "center", x: 0, z: 0 }));
  assert.equal(chassis.wheel, 0, "rock contact with the chassis alone must not count as wheel damage");
  const contact = step(startState(spec, { u: 0.5, v: 0.5 }), spec, { throttle: 1, steer: 0 }, 0.05, makeEnv({ ...rock, x: 0.8 }));
  assert.ok(contact.wheel > 0);
}
