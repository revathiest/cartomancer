import type { MapScene } from '../shared/types.ts'
import { saveBlob } from './filePicker.ts'

const SAVE_KIND = 'dnd-map-maker-save'
const SAVE_VERSION = 1

type SaveFile = {
  kind: typeof SAVE_KIND
  version: number
  scene: MapScene
}

/** Serialize the current scene (everything needed to reproduce it exactly,
 *  including every hand edit — not just the generation params) and save it
 *  as a JSON file — via a native directory-picking "Save As" dialog where
 *  the browser supports it, otherwise a plain download. */
export async function saveMapToFile(scene: MapScene, fileName: string): Promise<void> {
  const payload: SaveFile = { kind: SAVE_KIND, version: SAVE_VERSION, scene }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  await saveBlob(blob, {
    suggestedName: fileName,
    description: 'DnD map save',
    mimeType: 'application/json',
    extensions: ['.json'],
  })
}

/** Parse a previously saved map file back into a scene. Throws with a
 *  human-readable message on anything that isn't a save this editor made. */
export async function loadMapFromFile(file: File): Promise<MapScene> {
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Not a valid JSON file.')
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Not a valid map save file.')
  }
  const candidate = parsed as Partial<SaveFile>
  if (candidate.kind !== SAVE_KIND) {
    throw new Error('That file isn’t a map save from this editor.')
  }
  if (!candidate.scene || typeof candidate.scene !== 'object') {
    throw new Error('Save file is missing its map data.')
  }
  // Newer save versions than this build understands are rejected rather than
  // loaded partially/incorrectly — same spirit as the kind check above.
  if (typeof candidate.version !== 'number' || candidate.version > SAVE_VERSION) {
    throw new Error('This save was made by a newer version of the editor.')
  }
  return candidate.scene as MapScene
}
