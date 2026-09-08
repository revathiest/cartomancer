import type { DungeonScene } from './types.ts'

/** Structured deep clone of a scene snapshot for the undo/redo stacks. */
export function cloneScene(scene: DungeonScene): DungeonScene {
  return structuredClone(scene)
}

const LIMIT = 60

export type History = {
  past: DungeonScene[]
  future: DungeonScene[]
}

export function emptyHistory(): History {
  return { past: [], future: [] }
}

/** Record the current scene as an undo point and clear the redo stack. */
export function record(history: History, current: DungeonScene): History {
  const past = [...history.past, cloneScene(current)]
  if (past.length > LIMIT) past.shift()
  return { past, future: [] }
}
