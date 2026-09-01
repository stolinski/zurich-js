# Local PBR textures

Bundled locally so the talk remains offline-safe.

All texture sets in this directory are **CC0** assets from [Poly Haven](https://polyhaven.com/).

- `wood-table/` — [Dark Wood](https://polyhaven.com/a/dark_wood), 1K JPG diffuse, OpenGL normal, and roughness maps.
- `painted-plaster/` — [Painted Plaster Wall](https://polyhaven.com/a/painted_plaster_wall), 1K JPG OpenGL normal and roughness maps. The wall's scene color supplies albedo so it remains art-directable under the saturated screen light.
- `rough-linen/` — [Rough Linen](https://polyhaven.com/a/rough_linen), 1K JPG diffuse, OpenGL normal, and roughness maps for the acoustic panels.
- `environments/unfinished_office_1k.hdr` — [Unfinished Office](https://polyhaven.com/a/unfinished_office), a 1K HDR equirect used only for office image-based lighting and reflections.

`office-carpet/` is [ambientCG Carpet 012](https://ambientcg.com/a/Carpet012), also CC0, with 1K JPG diffuse, OpenGL normal, and roughness maps.

`lightmaps/` contains original, deterministic world-space irradiance fields for
this talk. Regenerate them with `scripts/bake-cubicle-irradiance.py` and
`scripts/bake-home-irradiance.py`. They contain only low-frequency bounced
energy and floor occlusion; direct lights and VSM still establish direction and
cast shadows at runtime.

The files are runtime-local. Do not replace these paths with CDN URLs; conference Wi-Fi is not part of the render pipeline.
