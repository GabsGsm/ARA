# ARA — Earth expansion and machine learning (710 cells)

Source package delivered by the team for the Earth expansion. It is **integrated** into the site: `data/earth_grid.json` and `pipeline/regions.json` use this data, and `data/ml/ml_710.json` carries the K-Means groups shown on the site.

## Contents

- 714 records in the expanded Earth grid: 522 original and 192 new.
- 710 cells used to train K-Means (the 4 Prototype 1 reference rows are kept but left out of the search).
- New regions: Holuhraun (Iceland), Mauna Kea (Hawaii) and Erg Chebbi (Sahara, Morocco).
- Two K-Means models, with 3 and 5 attributes.
- Experimental topographic rankings for the eight planetary sectors (`ranking_top10_710.csv`).

## Integration

- The weighted distance of the original ranking is unchanged.
- The Joblib files are for Python; the browser uses the JSON parameters in `data/ml/ml_710.json`.
- K-Means group IDs are arbitrary: the site names the groups from their physical centres (gentle vs. rugged relief).
- `tests/test_core.mjs` checks the 714 records, the 3 × 64 new cells and the Top 10 of all 8 sectors against this package.

## Still to validate

- Full equivalence between the old and new Earth processing: grid origin and alignment, elevation data and quality rules.
- Silhouette and ARI do not prove geological or environmental equivalence.

## Audit notes

- The `regions` catalogue of the Earth grid gained holuhraun, mauna_kea and erg_chebbi without changing any terrain row.
- The `context` field has no lithology or geology for the new cells; the site says the data are unavailable and does not infer mineralogy.
- `known_analogs`, `run_ids`, metrics and model parameters were not changed.
