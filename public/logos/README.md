# Logo artwork

`syntax.svg`, `sentry.svg`, and `qr.svg` are rendered into the terminal canvas by
`src/terminal/assets.js` and `src/terminal/paint.js`.

They are loaded locally before the first screen paint, rasterized once, and
tinted to the shared phosphor hue. The harness presents each file as a decoded
local asset rather than as a DOM overlay or conventional full-colour logo slide.
