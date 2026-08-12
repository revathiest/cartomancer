import { useMapStore } from '../../state/mapStore.ts'

/**
 * Parchment background: a warm base rect, a low-opacity turbulence grain, and a
 * radial vignette. To use a real paper texture later, replace the grain <rect>
 * with an <image href="/textures/parchment.jpg" .../> spanning the bounds
 * (SWAP POINT).
 */
export function Background() {
  const { width, height } = useMapStore((s) => s.scene.bounds)
  // The solid parchment fill is painted by MapCanvas's pan surface (so it can
  // receive pan/deselect events); this layer adds only grain + vignette.
  return (
    <g>
      {/* SWAP POINT: replace this grain rect with an <image href="..."> texture. */}
      <rect x={0} y={0} width={width} height={height} filter="url(#paper-grain)" />
      <rect x={0} y={0} width={width} height={height} fill="url(#vignette)" />
    </g>
  )
}
