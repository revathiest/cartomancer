import { MAP_SVG_ID, EDITOR_OVERLAY_ID } from '../rendering/MapCanvas.tsx'
import { saveBlob } from './filePicker.ts'

const PARCHMENT = '#efe2c4'

type ExportOptions = {
  size?: number
  fileName?: string
  width: number
  height: number
  /** DOM id of the source `<svg>` to export — defaults to the city map's,
   *  so existing callers don't need to change. Pass a different id (e.g.
   *  the dungeon canvas's) to export a different live SVG. */
  svgId?: string
  /** DOM id of an editor-overlay child (drag handles, selection outlines)
   *  to strip before rasterizing, if present. Defaults to the city
   *  editor's overlay id. */
  overlayId?: string
}

/**
 * Serialize the live map SVG → offscreen canvas → PNG blob → download.
 * The editor overlay (drag handles, selection outlines) is stripped and the
 * viewBox is reset to the full world bounds so the export always captures the
 * whole map regardless of current on-screen zoom/pan.
 */
export async function exportPng(opts: ExportOptions): Promise<void> {
  const { width, height, size = 3000, fileName = 'city-map.png', svgId = MAP_SVG_ID, overlayId = EDITOR_OVERLAY_ID } = opts
  const source = document.getElementById(svgId) as SVGSVGElement | null
  if (!source) throw new Error('Map SVG not found')

  const clone = source.cloneNode(true) as SVGSVGElement
  clone.querySelector(`#${overlayId}`)?.remove()

  // Normalise to full-bounds framing at the requested pixel size.
  clone.setAttribute('viewBox', `0 0 ${width} ${height}`)
  clone.setAttribute('width', String(size))
  clone.setAttribute('height', String(size))
  clone.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  clone.style.background = PARCHMENT

  const svgString = new XMLSerializer().serializeToString(clone)
  const svgWithNs = svgString.includes('xmlns=')
    ? svgString
    : svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')

  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgWithNs)}`

  const img = new Image()
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Failed to rasterize SVG'))
  })
  img.src = url
  await loaded

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.fillStyle = PARCHMENT
  ctx.fillRect(0, 0, size, size)
  ctx.drawImage(img, 0, 0, size, size)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Failed to encode PNG')

  await saveBlob(blob, {
    suggestedName: fileName,
    description: 'City map image',
    mimeType: 'image/png',
    extensions: ['.png'],
  })
}
