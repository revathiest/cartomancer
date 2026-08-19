/** Single source of truth for the legend's on-map footprint — shared by the
 *  generator (which must reserve this much space, corner-anchored, so no
 *  room or corridor ever spawns under it) and the renderer (which draws it
 *  at exactly this size). Always sized to the EXPANDED state, even though
 *  the legend can be collapsed at runtime, so toggling it never changes
 *  what the generator already reserved. */
export const LEGEND_WIDTH = 168
export const LEGEND_PAD = 12
export const LEGEND_ROW_H = 22
/** Header row ("Legend ▾") plus one row per door flag (open, secret, stuck,
 *  locked ×2 kinds, trapped ×2 kinds) plus stairs (down, up). */
export const LEGEND_ROWS = 10
export const LEGEND_HEIGHT = LEGEND_PAD * 2 + LEGEND_ROW_H * LEGEND_ROWS
/** Gap between the legend card and the map's edge. */
export const LEGEND_MARGIN = 20
