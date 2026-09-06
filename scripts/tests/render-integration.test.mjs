import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import * as THREE from 'three'
import { Effect, EffectPass, FXAAEffect, ToneMappingEffect } from 'postprocessing'
import { createContactMaskData } from '../../src/lib/contactMask.js'
import { createOutputPass } from '../../src/lib/postOutput.js'
import { applyBakedDiffuse, configureBakedDiffuse } from '../../src/lib/bakedDiffuse.js'
import { makeProfiledSurface, SURFACE_PROFILES, SURFACE_TEXTURES } from '../../src/lib/surfaceProfiles.js'

for (const shape of ['rect', 'radial']) {
  test(`${shape} contact mask fades in the alphaMap's green channel`, () => {
    const size = 128
    const data = createContactMaskData(size, shape)
    const mask = (x, y) => data[(y * size + x) * 4 + 1]
    assert.ok(mask(64, 64) > 240)
    assert.equal(mask(0, 0), 0)
    assert.ok(mask(0, 64) < 2)
    assert.ok(mask(100, 64) > mask(120, 64))
    assert.ok(mask(120, 64) > mask(0, 64))
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4
        assert.equal(mask(x, y), mask(size - x - 1, y))
        assert.equal(mask(x, y), mask(x, size - y - 1))
        assert.equal(data[i], data[i + 1])
        assert.equal(data[i + 2], data[i + 1])
        assert.equal(data[i + 3], 255)
      }
    }
    assert.deepEqual(createContactMaskData(size, shape), data)
  })
}

test('rectangular occlusion hugs corners more than the radial footprint', () => {
  const rect = createContactMaskData(128, 'rect')
  const radial = createContactMaskData(128, 'radial')
  const i = (96 * 128 + 96) * 4 + 1
  assert.ok(rect[i] > radial[i] * 4)
})

test('FXAA is an explicit pass after tone mapping, with dither last', () => {
  const camera = new THREE.PerspectiveCamera()
  const fxaa = new FXAAEffect()
  const dither = new Effect('test-dither', 'void mainImage(const in vec4 c, const in vec2 uv, out vec4 o) { o = c; }')
  const toneMapping = new ToneMappingEffect()
  const finishing = new EffectPass(camera, toneMapping)
  const output = createOutputPass(camera, fxaa, dither)
  assert.ok(output instanceof EffectPass)
  assert.deepEqual(finishing.effects, [toneMapping])
  assert.deepEqual(output.effects, [fxaa, dither])
  assert.ok(!output.effects.includes(toneMapping))
  finishing.dispose()
  output.dispose()
})

test('AA reference profiles can omit FXAA without omitting finishing dither', () => {
  const dither = new Effect('test-dither', 'void mainImage(const in vec4 c, const in vec2 uv, out vec4 o) { o = c; }')
  const output = createOutputPass(new THREE.PerspectiveCamera(), null, dither)
  assert.deepEqual(output.effects, [dither])
  output.dispose()
})

test('baked diffuse texture decodes radiance on the existing fitted UV channel', () => {
  const source = new THREE.Texture({ width: 1024, height: 1418 })
  const texture = configureBakedDiffuse(source)
  assert.notEqual(source, texture)
  assert.equal(source.image, texture.image)
  assert.equal(source.flipY, true)
  assert.equal(texture.flipY, false)
  assert.equal(texture.channel, 0)
  assert.equal(texture.colorSpace, THREE.SRGBColorSpace)
  assert.equal(texture.wrapS, THREE.ClampToEdgeWrapping)
  assert.equal(texture.wrapT, THREE.ClampToEdgeWrapping)
})

test('Cycles illumination replaces diffuse, composes hooks, and leaves specular intact', () => {
  const material = new THREE.MeshStandardMaterial()
  const texture = new THREE.Texture()
  let previousRan = false
  material.onBeforeCompile = () => { previousRan = true }
  material.customProgramCacheKey = () => 'existing-finish'
  assert.equal(applyBakedDiffuse(material, texture, 8), material)
  const shader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader }
  material.onBeforeCompile(shader, null)
  assert.ok(previousRan)
  assert.equal(material.lightMap, texture)
  assert.equal(material.lightMapIntensity, 8)
  assert.equal(material.customProgramCacheKey(), 'existing-finish|baked-diffuse-v1')
  assert.match(shader.fragmentShader, /reflectedLight\.directDiffuse = vec3\(0\.0\)/)
  assert.match(shader.fragmentShader, /reflectedLight\.indirectDiffuse = lightMapIrradiance \* diffuseColor\.rgb/)
  assert.doesNotMatch(shader.fragmentShader, /reflectedLight\.(directSpecular|indirectSpecular) =/)
  assert.ok(shader.fragmentShader.includes('#include <lights_fragment_end>'))
  // The injection relies on this library variable's public shader chunk.
  assert.match(THREE.ShaderChunk.lights_fragment_maps, /vec3 lightMapIrradiance/)
})

test('shared surfaces use local maps, physical repeats and explicit colour spaces', () => {
  const mapSets = Object.fromEntries(Object.entries(SURFACE_TEXTURES).map(([name, slots]) => [
    name, Object.fromEntries(Object.entries(slots).map(([slot, path]) => {
      assert.ok(existsSync(new URL(`../../public${path}`, import.meta.url)), path)
      return [slot, new THREE.Texture()]
    })),
  ]))
  for (const [name, profile] of Object.entries(SURFACE_PROFILES)) {
    const material = makeProfiledSurface(name, mapSets)
    assert.ok(material.isMeshPhysicalMaterial)
    assert.equal(material.name, name)
    assert.equal(material.roughness, profile.roughness)
    assert.equal(material.color.getHexString(), profile.color.slice(1))
    assert.deepEqual(material.normalMap.repeat.toArray(), profile.repeat)
    assert.equal(material.normalScale.x, profile.normalScale)
    assert.equal(material.map.colorSpace, THREE.SRGBColorSpace)
    assert.equal(material.normalMap.colorSpace, THREE.NoColorSpace)
    assert.equal(material.roughnessMap.colorSpace, THREE.NoColorSpace)
    assert.notEqual(material.map, mapSets[profile.maps].map)
    assert.ok(profile.roughness > 0 && profile.roughness <= 1)
  }
  assert.throws(() => makeProfiledSurface('unregistered material', mapSets), /Unknown shared surface/)
  assert.throws(() => makeProfiledSurface('Chair wool', {}), /missing linen.map/)
})

test('the selective floor bake is unclipped and matches its recorded dimensions', () => {
  const root = new URL('../../public/textures/lightmaps/', import.meta.url)
  const metadata = JSON.parse(readFileSync(new URL('office-floor-cycles.json', root)))
  const png = readFileSync(new URL('office-floor-cycles.png', root))
  assert.equal(png.readUInt32BE(16), metadata.width)
  assert.equal(png.readUInt32BE(20), metadata.height)
  assert.equal(metadata.clippedTexels, 0)
  assert.ok(metadata.maximumRadiance > 0 && metadata.maximumRadiance <= metadata.range)
  assert.equal(metadata.albedo, false)
  assert.deepEqual(metadata.passes, ['direct', 'indirect'])
})
