# ARA — Expansão terrestre e Machine Learning

## Conteúdo

- 714 registros no earth_grid expandido: 522 originais e 192 novos.
- 710 células utilizadas no treinamento do K-Means.
- 4 referências do protótipo original preservadas.
- Novas regiões: Holuhraun, Mauna Kea e Erg Chebbi.
- Dois modelos K-Means, com 3 e 5 atributos.
- Rankings topográficos experimentais para oito setores planetários.

## Integração

A distância ponderada do ranking original permanece inalterada.
O earth_grid_expandido.json é uma PROPOSTA, não substitui automaticamente o arquivo oficial.
O campo regions do earth_grid expandido inclui os 5 registros originais (protótipo e 4 áreas) e as 3 novas áreas. A configuração do pipeline com as 7 áreas de busca está em regions_expandido_proposta.json.
Os arquivos Joblib são destinados ao Python. O navegador pode utilizar os parâmetros JSON.
Os IDs dos grupos K-Means são arbitrários: interprete os centros físicos antes de nomear os perfis.

## Validação pendente

Conferir equivalência integral entre processamento terrestre antigo e novo, origem e alinhamento das grades, dados de elevação e regras de qualidade.
Silhouette e ARI não comprovam equivalência geológica ou ambiental.
Testar o frontend antes da publicação definitiva.

## Observações da auditoria

- Foram adicionadas ao catálogo `regions` do earth_grid as regiões holuhraun, mauna_kea e erg_chebbi, sem alterar nenhuma linha de terreno.
- O campo `context` não contém litologia ou geologia das novas células: indicar dados indisponíveis no site, sem inferir mineralogia.
- Não foram alterados `known_analogs`, `run_ids`, métricas ou parâmetros dos modelos.
- As alterações são de integração de metadados; a verificação completa do pipeline topográfico e o teste no frontend continuam pendentes.
