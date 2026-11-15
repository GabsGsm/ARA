# ARA

**ARA finds places on Earth that resemble fixed Moon and Mars exploration sites — and shows, dimension by dimension, what is analogous, what is not, and where data is missing.**

NASA Space Apps Challenge 2026 · Challenge: *Identify Earth locations analogous to permanent base sites on the Moon and Mars.*

## What it does

- **Fixed planetary sites:** Jezero crater sectors 01–04 on Mars (Perseverance landing area) and Artemis III candidate regions at the lunar south pole. Each is a 5 × 5 km window at 100 m/pixel.
- **Dynamic Earth search:** a grid of 5 × 5 km Earth cells is ranked by terrain similarity. Users choose what the analog is *for* (default, rover mobility, landscape) or set their own weights, and the ranking updates instantly.
- **Analogous / not analogous:** every match shows per-dimension verdicts (slope, roughness, relief, temperature, mineralogy) plus the limits no Earth site can reproduce (gravity, atmosphere, radiation).
- **Data-quality simulation:** recomputes the same cells with lower resolution, missing data or elevation noise to show how much a conclusion depends on the data. Simulated results are always labelled.
- **Traceability:** every pipeline run writes `data/runs/<run_id>.json` with parameters, sources and requests.

## Method

For each 5 × 5 km window (100 m/pixel): mean slope (`np.gradient`), mean roughness (local standard deviation in a 3 × 3 window = 300 m) and relief (max − min). Similarity:

```
d = sqrt( Σ wᵢ · ((siteᵢ − cellᵢ) / scaleᵢ)² )     scales: 10°, 15 m, 500 m · default weights: 0.40 / 0.35 / 0.25
```

Stability: 2,000 random weight vectors, Dirichlet(1,1,1), seed 42 — sensitivity to weights, not the probability of a true analog. Same method as Prototype 1 (`mock/`), and the tests check that ARA reproduces Prototype 1's 16 distances and stability values exactly.

## Data

| Data | Use | Source |
| --- | --- | --- |
| Mars 2020 TRN CTX DTM mosaic, Jezero (20 m) | Mars terrain | NASA/USGS Astrogeology |
| Jezero Western Rim Mineral Maps v1.0 (CRISM) | Mars mineralogy context | Valantinas et al. (2026), Zenodo 10.5281/zenodo.22257754, CC BY 4.0 |
| LRO LOLA polar DEM (LDEM_80S_*MPP_ADJ) | Moon terrain | NASA Goddard PGDA (Barker et al.) |
| Artemis III candidate landing regions | Moon site list | NASA (Oct 2024) |
| Down Selected Artemis III Candidate Landing Site Navigational Grids | Moon site centres | USGS, McClernan (2024), doi:10.5066/P1MEQ6UK, CC0 |
| Mars Trek WMTS (Viking MDIM 2.1 colour mosaic) | Mars context map | NASA Solar System Treks |
| Mapzen Terrain Tiles (z12) | Earth terrain grid | AWS Open Data |
| Macrostrat API v2 | Earth lithology context | macrostrat.org (CC BY 4.0) |
| GIBS (MODIS true colour) | Map layer | NASA GIBS |
| World Imagery | Basemap | Esri |

## Repository

```
pipeline/   Python, run offline (terrain.py, moon_regions_from_usgs.py, build_earth_grid.py, build_moon_sites.py, build_catalog.py, stability.py, build_simulation.py, enrich_context.py)
data/       JSON outputs read by the app (+ runs/ trace logs)
web/        static app (GitHub Pages)
mock/       Prototype 1 (HTML v7.3 + Colab notebook), reference only
tests/      python tests/test_pipeline.py · node tests/test_core.mjs
```

## Run it

```bash
pip install -r pipeline/requirements.txt
python pipeline/convert_mock.py            # Prototype 1 data -> data/ (example grid)
python pipeline/build_earth_grid.py --region atacama
python pipeline/moon_regions_from_usgs.py --folder <USGS data release>   # fills Moon site centres
python pipeline/build_moon_sites.py --dem LDEM_80S_40MPP_ADJ.TIF
python pipeline/build_catalog.py
python pipeline/stability.py
python pipeline/enrich_context.py --top 50
python pipeline/build_simulation.py --mars-tif jezero_01=.../jezero_01_dem_100m.tif
# view locally (serves web/ and reads data/ directly; no copying)
python tools/dev.py
```

## Design

Colours: deep petrol blue `#071d24 → #123a40` fading to sage `#8fa98f`, gold accent `#f2b53a`, ink `#f4f1e8`. Fonts: Michroma (headings, logo) and Lexend (text), from Google Fonts. Design tokens live at the top of `web/css/style.css`. The home-page planets use NASA Trek tiles (Viking colour mosaic, LRO WAC) when online, with a gradient fallback offline.

## Limitations

Three summary statistics do not capture slope orientation, drainage or multi-scale texture. Weights and scales are not calibrated against expert labels. Earth and planetary DEMs come from different instruments with different vertical accuracy. Mapped lithology is not verified mineralogy, and 0% CRISM coverage means no map overlap, not absence of minerals. Earth cannot reproduce lunar/Martian gravity, vacuum or thin atmosphere, or radiation.

## Use of AI

<!-- Fill in before submitting: which tools, where, how. Mark AI-generated images with a visible watermark. -->
