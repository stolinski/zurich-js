# crt_monitor

## What it is

The hero monitor for "The True Cost of AI Coding" — a widescreen CRT using the
industrial construction language of the Sony GDM-FW900. Face, shoulder, neck,
concealed control barrel, articulated pedestal, and base export as one render
asset.

**This is a render asset. It is never printed.** It is modelled at true scale in
millimetres and loaded by `src/scene/Monitor.jsx`.

Update loop:

```text
nurb dev
nurb export crt-monitor --formats glb
cp build/crt_monitor.glb public/models/crt-monitor.glb
```

## Design notes

**Frame: X = width, Y = up, screen faces +Z.** Runtime applies one uniform scale
of `SCREEN_SIZE.w / 520` and shifts the housing so the authored glass centre
lands on the scene origin. The stand underside remains exactly **Y=-288mm** so
the existing desk-contact calculation remains valid.

The fit-critical opening remains exactly **523 × 295mm**, centred at
**X=0 / Y=-17mm**. The deepest pocket still floors at Z=-12mm for the existing
glass offset. Two larger, shallower recesses form a visibly stepped bezel without
changing that opening.

The former face centred its housing on the opening, accidentally splitting the
extra height evenly and erasing the intended chin asymmetry. The new housing
places the opening high in a 609mm-wide front: a 43mm top/side frame and 78mm
chin, plus a smaller projecting fascia over a broader structural face.

The lower-left controls now sit on a real transverse cylindrical barrel inside a
larger cylindrical bay, matching the concealed rotating-module logic of the
FW900 era. A narrow flat rail preserves the runtime insert centres at
`(-222,-175)`, `(-194,-175)`, and `(-161,-175)`; the first existing insert
continues to carry the green status light. A lower service split and short seam
returns remain legible from the front.

The shell is a five-station ruled loft with a deliberately held front shoulder.
It stays near full section through the first 116mm, then gathers through three
controlled breaks into a nested service collar, neck, and rear cap. This makes
cabinet depth and side weight dominate at the authored 70° view rather than
reading as a long wedge.

The stand is an integrated load-bearing assembly: 440 × 360mm rounded footprint,
stepped upper base, circular turntable, broad tapered pedestal, paired yoke
cheeks, 300mm transverse tilt barrel, and large blind pivot caps. It is meant to
read as the support for a 40kg tube, not as a thin flat-panel stem.

Four broad 82 × 8 × 88mm vent cuts per side replace the denser slot field. They
retain visible cut depth and remain stable when minified. One U-shaped shoulder
split supplies the other side construction cue without adding microdetail.

The final GLB is **609 × 461.5 × 522mm**, one valid mesh/solid, **20,424
triangles**, with no non-finite vertices or degenerate triangles. Convex
highlight edges receive the 2.5mm polish pass; authored concave seams stay crisp.

## Don't

**Don't act on ordinary printability findings.** This asset has no print bed,
layer direction, supports, or printer volume. The binding structural checks are
one valid solid, finite export geometry, stable silhouette, and the triangle
budget.

**Don't change the 523 × 295mm opening, its X=0 / Y=-17mm centre, the 520mm
runtime scale reference, the Z=-12mm pocket floor, or the Y=-288mm stand
underside.** Those values are consumed by the live glass, cold-open overscan,
housing shift, and desk-contact math.

**Don't move the three control recess centres.** `Monitor.jsx` supplies separate
button inserts and the status light at those authored coordinates. Change their
surrounding barrel, not the interface points.

**Don't return to a centred opening or a thin stem/plate stand.** Those were the
main reasons the previous silhouette still read as a generic flat panel despite
its rear detail.

**Don't multiply vent slots, labels, screws, or decorative grooves.** Broad cuts,
two bezel steps, one shoulder split, the control bay, and the pivot hardware are
the authored hierarchy. Extra microdetail will shimmer before it helps.

**Don't rebuild this in JavaScript or compensate with scene transforms.** Shape
changes belong here while the runtime scale/placement contract stays fixed.

## Changelog

- 2026-08-26: redesigned the hero silhouette around FW900 construction cues:
  corrected the chin asymmetry, added a stronger stepped fascia/bezel, authored
  a concealed cylindrical control bay with existing button/LED interfaces,
  held more mass in the tube shoulder, rebuilt the stand as an integrated
  turntable/pedestal/yoke/pivot/base, reduced vents to four stable broad slots
  per side, preserved every runtime/opening contract, and exported a validated
  20,424-triangle GLB.
- 2026-08-26: rebuilt the shell as a five-station profile; added a stepped bezel
  seat, mould split, broad stable vents, grouped control well, articulated
  stand/plinth/pivot hardware, rear service collar, and cable gland; exported at
  15,716 triangles while preserving the authored opening exactly.
- 2026-08-25: added paired shoulder vents, a lower service-panel seam, and
  recessed chin controls; re-exported the GLB render asset.
- Initial: face + three-section lofted tube + neck + stand (base plate and
  tapered column), polished at 2.5mm.
