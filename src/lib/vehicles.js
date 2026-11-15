// Ficha dos veículos: dados publicados pela NASA/JPL e a lição de cada um para quem prepara uma missão tripulada.
// `len` = comprimento usado para colocar o modelo em escala real (m). `site` = cena do laboratório 3D para vê-lo no relevo.
export const VEHICLES = [
  {
    key: "sojourner", name: "Sojourner", body: "mars", mission: "Mars Pathfinder", year: 1997, len: 0.65,
    site: "jezero_hirise_pouso", model: "Simplificado no ARA com as dimensões reais (a NASA não publica GLB gratuito)",
    specs: [["Massa", "10,6 kg"], ["Tamanho", "65 × 48 × 30 cm"], ["Velocidade", "≈ 1 cm/s"], ["Percorreu", "≈ 100 m em 83 sóis"], ["Energia", "Painel solar"]],
    lesson: "Provou que a suspensão rocker-bogie passa por pedras do tamanho das rodas sem tombar. Toda a mobilidade em Marte desde então vem daí.",
    facts: ["Foi planejado para 7 sóis e trabalhou 83.", "Só falava com a Terra através do módulo de pouso — quando o módulo parou, o rover também ficou mudo."],
  },
  {
    key: "mer", name: "Spirit e Opportunity", body: "mars", mission: "Mars Exploration Rovers", year: 2004, len: 1.6,
    site: "jezero_hirise_pouso", model: "Modelo 3D oficial da NASA",
    specs: [["Massa", "185 kg cada"], ["Tamanho", "1,6 × 2,3 × 1,5 m"], ["Velocidade", "até 5 cm/s"], ["Percorreu", "Opportunity 45,2 km · Spirit 7,7 km"], ["Energia", "Painel solar"]],
    lesson: "Solo é o risco que a imagem não mostra: o Spirit ficou preso em areia fofa em 2009 e nunca saiu; o Opportunity passou semanas atolado numa duna em 2005. Medir capacidade de suporte do solo no análogo é tão importante quanto a declividade.",
    facts: ["Planejados para 90 sóis: o Opportunity trabalhou mais de 14 anos, até a tempestade de poeira de 2018.", "Ventos de Marte limparam os painéis solares várias vezes e estenderam as missões."],
  },
  {
    key: "curiosity", name: "Curiosity", body: "mars", mission: "Mars Science Laboratory", year: 2012, len: 3.0,
    site: "jezero_hirise_pouso", model: "Modelo 3D oficial da NASA",
    specs: [["Massa", "899 kg"], ["Tamanho", "2,9 × 2,7 × 2,2 m"], ["Rodas", "50 cm de alumínio"], ["Percorreu", "mais de 30 km na cratera Gale"], ["Energia", "Gerador nuclear (MMRTG)"]],
    lesson: "Pedras pontudas furaram as rodas em 2013 e a equipe passou a planejar rotas pela textura do solo, não só pela declividade. O mesmo vale para botas e pneus de uma tripulação.",
    facts: ["Resiste a 45° de inclinação sem tombar, mas a equipe evita passar de 30°.", "Sua estação REMS mede pressão e temperatura todos os dias: a pressão em Gale sobe e desce cerca de 25% ao longo do ano marciano."],
  },
  {
    key: "perseverance", name: "Perseverance", body: "mars", mission: "Mars 2020", year: 2021, len: 3.0,
    site: "jezero_hirise_pouso", model: "Modelo 3D oficial da NASA",
    specs: [["Massa", "1.025 kg"], ["Tamanho", "3,0 × 2,7 × 2,2 m"], ["Velocidade", "até 4,2 cm/s"], ["Navegação", "AutoNav: dirige sozinho"], ["Energia", "Gerador nuclear (MMRTG)"]],
    lesson: "O MOXIE, a bordo, produziu oxigênio a partir do CO₂ de Marte — o primeiro teste de recurso local para respirar e para combustível. E o rover escolhe sozinho a rota entre comandos, como uma tripulação vai precisar fazer com 20 min de atraso de comunicação.",
    facts: ["Guarda amostras de rocha em tubos para uma futura missão trazê-las à Terra.", "A estação MEDA mede pressão, temperatura, vento e poeira em Jezero — os dados do ambiente que um traje vai enfrentar."],
  },
  {
    key: "ingenuity", name: "Ingenuity", body: "mars", mission: "Mars 2020", year: 2021, len: 1.2,
    site: "jezero_hirise_pouso", model: "Modelo 3D oficial da NASA",
    specs: [["Massa", "1,8 kg"], ["Rotores", "1,2 m, dois coaxiais"], ["Voos", "72 (planejados: 5)"], ["Ar", "≈ 1% da densidade da Terra"], ["Energia", "Painel solar + bateria"]],
    lesson: "Batedor aéreo: fotografou o caminho à frente do Perseverance. Para uma tripulação, um drone que mapeia a rota antes da caminhada economiza tempo de EVA e reduz risco.",
    facts: ["Primeiro voo motorizado em outro planeta, em 19 de abril de 2021.", "Os rotores giram mais de 2.400 rpm para sustentar o voo num ar tão rarefeito."],
  },
  {
    key: "lrv", name: "Carro lunar Apollo (LRV)", body: "moon", mission: "Apollo 15, 16 e 17", year: 1971, len: 3.1,
    site: "haworth_01", model: "Simplificado no ARA com as dimensões reais",
    specs: [["Massa", "210 kg"], ["Carga", "490 kg (2 astronautas + equipamentos)"], ["Tamanho", "3,1 m, bitola 1,8 m"], ["Velocidade", "≈ 13 km/h"], ["Energia", "Baterias de prata-zinco"]],
    lesson: "Regra do 'walkback': o carro nunca ia mais longe do que os astronautas conseguiriam voltar a pé com o oxigênio do traje. O alcance do veículo é limitado pelo consumível do pior caso — a Travessia gêmea do ARA estima esse gasto.",
    facts: ["Dobrável: ia preso na lateral do módulo lunar.", "Na Apollo 17 rodou cerca de 36 km no total."],
  },
  {
    key: "lunar_module", name: "Módulo Lunar Apollo", body: "moon", mission: "Apollo 11–17", year: 1969, len: 9.4,
    site: "haworth_01", model: "Modelo 3D oficial da NASA",
    specs: [["Altura", "≈ 7 m"], ["Largura", "≈ 9,4 m com as pernas"], ["Tripulação", "2"], ["Estadia", "até ≈ 75 h (Apollo 17)"], ["Pouso", "6 missões"]],
    lesson: "O pouso precisa de chão com pouca declividade: a Artemis III usa < 10° em 100 m — a camada 'Janela operacional' do 3D mostra onde isso coincide com Sol e Terra visíveis.",
    facts: ["Na Apollo 11 o computador avisou alarmes de sobrecarga e Armstrong pilotou manualmente para evitar um campo de rochas.", "Durante a estadia, o módulo era casa, câmara de despressurização e nave de retorno."],
  },
  {
    key: "astronaut", name: "Astronauta em EVA", body: "both", mission: "Apollo · Artemis", year: null, len: 0.9,
    site: "haworth_01", model: "Modelo 3D oficial da NASA",
    specs: [["Pressão do traje", "≈ 296 hPa (4,3 psi), O₂ puro"], ["Lá fora", "Marte ≈ 6 hPa · Lua: vácuo"], ["Temperatura", "Lua: −173 a +127 °C"], ["Gravidade", "Marte 38% · Lua 17%"]],
    lesson: "Pressão e temperatura mandam em tudo: o traje é uma nave pessoal. A aba 'Pressão e temperatura' no Explorar compara a missão com cada análogo e diz como ensaiar a diferença.",
    facts: ["Luvas pressurizadas são a parte que mais cansa: cada movimento empurra contra o ar do traje.", "Nas análises das Apollo, o gasto de energia em EVA foi menor do que nos ensaios na Terra com o mesmo trabalho."],
  },
];

export const byKey = (k) => VEHICLES.find((v) => v.key === k);

// Versão em inglês (mesmos dados).
const OFFICIAL = "Official NASA 3D model";
const EN = {
  sojourner: { model: "Simplified in ARA with the real dimensions (NASA does not publish a free GLB)",
    specs: [["Mass", "10.6 kg"], ["Size", "65 × 48 × 30 cm"], ["Speed", "≈ 1 cm/s"], ["Distance", "≈ 100 m in 83 sols"], ["Power", "Solar panel"]],
    lesson: "Proved that rocker-bogie suspension can cross wheel-sized rocks without tipping. All Mars mobility since then comes from it.",
    facts: ["Planned for 7 sols, it worked for 83.", "It only talked to Earth through the lander — when the lander stopped, the rover went silent too."] },
  mer: { name: "Spirit and Opportunity", model: OFFICIAL,
    specs: [["Mass", "185 kg each"], ["Size", "1.6 × 2.3 × 1.5 m"], ["Speed", "up to 5 cm/s"], ["Distance", "Opportunity 45.2 km · Spirit 7.7 km"], ["Power", "Solar panel"]],
    lesson: "Soil is the risk the image does not show: Spirit got stuck in soft sand in 2009 and never got out; Opportunity spent weeks stuck in a dune in 2005. Measuring soil bearing capacity at the analog matters as much as slope.",
    facts: ["Planned for 90 sols: Opportunity worked for more than 14 years, until the 2018 dust storm.", "Martian winds cleaned the solar panels several times and extended the missions."] },
  curiosity: { model: OFFICIAL,
    specs: [["Mass", "899 kg"], ["Size", "2.9 × 2.7 × 2.2 m"], ["Wheels", "50 cm aluminium"], ["Distance", "over 30 km in Gale crater"], ["Power", "Nuclear generator (MMRTG)"]],
    lesson: "Sharp rocks punctured the wheels in 2013 and the team began planning routes by ground texture, not just slope. The same applies to a crew's boots and tyres.",
    facts: ["It withstands a 45° tilt without tipping, but the team avoids going beyond 30°.", "Its REMS station measures pressure and temperature every day: pressure at Gale rises and falls by about 25% over the Martian year."] },
  perseverance: { model: OFFICIAL,
    specs: [["Mass", "1,025 kg"], ["Size", "3.0 × 2.7 × 2.2 m"], ["Speed", "up to 4.2 cm/s"], ["Navigation", "AutoNav: drives itself"], ["Power", "Nuclear generator (MMRTG)"]],
    lesson: "MOXIE, on board, made oxygen from Martian CO₂ — the first test of a local resource for breathing and fuel. And the rover picks its own route between commands, as a crew will need to do with a 20-minute communication delay.",
    facts: ["It stores rock samples in tubes for a future mission to bring them to Earth.", "The MEDA station measures pressure, temperature, wind and dust at Jezero — the environment a spacesuit will face."] },
  ingenuity: { model: OFFICIAL,
    specs: [["Mass", "1.8 kg"], ["Rotors", "1.2 m, two coaxial"], ["Flights", "72 (planned: 5)"], ["Air", "≈ 1% of Earth's density"], ["Power", "Solar panel + battery"]],
    lesson: "Aerial scout: it photographed the way ahead of Perseverance. For a crew, a drone that maps the route before the walk saves EVA time and reduces risk.",
    facts: ["First powered flight on another planet, on 19 April 2021.", "The rotors spin at more than 2,400 rpm to stay aloft in such thin air."] },
  lrv: { name: "Apollo Lunar Roving Vehicle (LRV)", mission: "Apollo 15, 16 and 17", model: "Simplified in ARA with the real dimensions",
    specs: [["Mass", "210 kg"], ["Payload", "490 kg (2 astronauts + equipment)"], ["Size", "3.1 m, 1.8 m track"], ["Speed", "≈ 13 km/h"], ["Power", "Silver-zinc batteries"]],
    lesson: "The walk-back rule: the rover never went farther than the astronauts could walk back with their suit's oxygen. Vehicle range is limited by the worst-case consumable — ARA's Twin Traverse estimates that cost.",
    facts: ["Foldable: it rode strapped to the side of the lunar module.", "On Apollo 17 it covered about 36 km in total."] },
  lunar_module: { name: "Apollo Lunar Module", model: OFFICIAL,
    specs: [["Height", "≈ 7 m"], ["Width", "≈ 9.4 m with legs"], ["Crew", "2"], ["Stay", "up to ≈ 75 h (Apollo 17)"], ["Landings", "6 missions"]],
    lesson: "Landing needs gently sloping ground: Artemis III uses < 10° over 100 m — the 3D Operational window layer shows where that coincides with sunlight and Earth in view.",
    facts: ["On Apollo 11 the computer raised overload alarms and Armstrong flew manually to avoid a boulder field.", "During the stay, the module was home, airlock and return ship."] },
  astronaut: { name: "Astronaut on EVA", model: OFFICIAL,
    specs: [["Suit pressure", "≈ 296 hPa (4.3 psi), pure O₂"], ["Outside", "Mars ≈ 6 hPa · Moon: vacuum"], ["Temperature", "Moon: −173 to +127 °C"], ["Gravity", "Mars 38% · Moon 17%"]],
    lesson: "Pressure and temperature rule everything: the suit is a personal spacecraft. The Pressure and temperature tab in Explore compares the mission with each analog and tells you how to rehearse the difference.",
    facts: ["Pressurised gloves are the most tiring part: every movement pushes against the suit's air.", "Apollo analyses found EVA energy cost lower than in Earth rehearsals of the same work."] },
};
/** Ficha no idioma pedido. */
export const localize = (v, lang) => (lang === "en" && EN[v.key] ? { ...v, ...EN[v.key] } : v);
