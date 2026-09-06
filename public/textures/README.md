# Local PBR textures

Bundled locally so the talk remains offline-safe.

The source PBR maps below are **CC0** assets from [Poly Haven](https://polyhaven.com/), except the noted ambientCG carpet. Lightmaps are original generated assets.

- `wood-table/` — [Dark Wood](https://polyhaven.com/a/dark_wood), 1K JPG diffuse, OpenGL normal, and roughness maps.
- `painted-plaster/` — [Painted Plaster Wall](https://polyhaven.com/a/painted_plaster_wall), 1K JPG OpenGL normal and roughness maps. The wall's scene color supplies albedo so it remains art-directable under the saturated screen light.
- `rough-linen/` — [Rough Linen](https://polyhaven.com/a/rough_linen), 1K JPG diffuse, OpenGL normal, and roughness maps for the acoustic panels.
- `environments/unfinished_office_1k.hdr` — [Unfinished Office](https://polyhaven.com/a/unfinished_office), a 1K HDR equirect used only for office image-based lighting and reflections.

`office-carpet/` is [ambientCG Carpet 012](https://ambientcg.com/a/Carpet012), also CC0, with 1K JPG diffuse, OpenGL normal, and roughness maps.

`rough-linen/diffuse-neutral.jpg` is a neutral-luminance derivative of the CC0
linen diffuse. It preserves the weave without tinting every textile blue.
Regenerate with ImageMagick:

```sh
magick public/textures/rough-linen/diffuse.jpg \
  -colorspace RGB -colorspace Gray -colorspace sRGB -quality 92 \
  public/textures/rough-linen/diffuse-neutral.jpg
```

`lightmaps/office-floor-cycles.png` is a **geometry-traced Cycles diffuse bake**
of the authored office, direct + indirect with albedo excluded. Its JSON records
the source/contract hashes, seed, samples, bounds and encoding. It replaces the
old analytical floor layer and contact cards, rather than adding more light.

```sh
blender --background blender/office/office.blend --threads 8 \
  --python-exit-code 1 --python blender/office/bake_floor.py
```

The PNG stores linear radiance divided by `range`, encoded as sRGB—not a display
render. Runtime decoding restores the range before ACES. The floor already has
fitted UV0; `flipY=false` matches the GLB V conversion. Other receivers need
non-overlapping bake UVs before adopting this technique. Re-bake after changing
the office geometry, source lighting or shared material contract.

The remaining `lightmaps/` files are the older analytical irradiance fields.
Their generators are `scripts/bake-cubicle-irradiance.py` and
`scripts/bake-home-irradiance.py`; those scripts do **not** regenerate the Cycles
bake. The old `cubicle-floor-irradiance.png` is no longer a runtime receiver.

The files are runtime-local. Do not replace these paths with CDN URLs; conference Wi-Fi is not part of the render pipeline.
