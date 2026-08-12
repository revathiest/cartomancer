import { createContext, useContext } from 'react'
import type { Point } from '../shared/types.ts'

/** Converts a browser client (screen) coordinate into SVG world coordinates. */
export type ClientToWorld = (clientX: number, clientY: number) => Point

export const CoordsContext = createContext<ClientToWorld | null>(null)

export function useClientToWorld(): ClientToWorld {
  const ctx = useContext(CoordsContext)
  if (!ctx) throw new Error('CoordsContext not provided')
  return ctx
}
