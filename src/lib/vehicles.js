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
