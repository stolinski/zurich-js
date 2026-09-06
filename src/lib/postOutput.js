import { EffectPass } from 'postprocessing'

/** FXAA must read a finished LDR buffer, not share a pass with ACES/exposure.
 * It reads neighbours from inputBuffer but its centre from inputColor. The
 * library does not mark it CONVOLUTION, so React's composer otherwise fuses it.
 * Dither is safe after FXAA here: it does not sample neighbouring pixels.
 */
export function createOutputPass(camera, fxaa, dither) {
  return new EffectPass(camera, ...(fxaa ? [fxaa, dither] : [dither]))
}
