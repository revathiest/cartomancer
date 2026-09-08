import type { GenParams } from '../shared/types.ts'
import type { DungeonParams } from '../dungeon/types.ts'

const REPO_URL = 'https://github.com/revathiest/cartomancer'
const MERGE_FAILURE_LOG_KEY = 'dnd-map-maker:merge-failure-log'

/** GitHub caps issue-prefill URLs well under this, but keeps things
 *  comfortably short regardless of how big a future context section gets. */
const MAX_BODY_LENGTH = 6000

function mergeFailureCount(): number {
  try {
    const raw = localStorage.getItem(MERGE_FAILURE_LOG_KEY)
    return raw ? (JSON.parse(raw) as unknown[]).length : 0
  } catch {
    return 0
  }
}

/** Builds the plain-text body for a pre-filled GitHub issue — everything
 *  useful for reproducing a bug that the reporter shouldn't have to type
 *  out by hand (browser, viewport, current city seed/params), formatted so
 *  it reads cleanly in GitHub's raw "Write" textarea, not just the rendered
 *  "Preview" — most reporters here won't be developers and won't know to
 *  switch tabs to make sense of markdown syntax or HTML comments. No HTML
 *  tags, no comment syntax, no code fences — just plain labeled lines. */
function buildIssueBody(params: GenParams): string {
  const failureCount = mergeFailureCount()
  const lines = [
    'What happened?',
    '(Describe the bug, and what you expected to happen instead.)',
    '',
    '',
    'Steps to reproduce',
    '1. ',
    '2. ',
    '3. ',
    '',
    '',
    '----------------------------------------',
    "Everything below this line is filled in automatically — please leave it as-is, it helps track down the bug.",
    '',
    `City name: ${params.cityName}`,
    `City seed: ${params.seed}`,
    `Districts: ${params.districtCount}`,
    `Gates: ${params.gateCount}`,
    `Block size: ${params.blockSize}`,
    `Lane width: ${params.laneWidth}`,
    `Building spacing: ${params.buildingGap}`,
    `Building density: ${params.buildingDensity}`,
    `City wall: ${params.hasWall ? 'yes' : 'no'}`,
    `River: ${params.hasRiver ? `yes (width ${params.riverWidth})` : 'no'}`,
    `Coast: ${params.hasCoast ? `yes (${params.coastKind}, ${params.coastSide} side)` : 'no'}`,
    `Browser: ${navigator.userAgent}`,
    `Window size: ${window.innerWidth} x ${window.innerHeight}`,
    ...(failureCount > 0
      ? [`Note: ${failureCount} building-merge issue(s) were also recorded automatically on this device.`]
      : []),
  ]
  const body = lines.join('\n')
  return body.length > MAX_BODY_LENGTH ? body.slice(0, MAX_BODY_LENGTH) + '\n\n(truncated)' : body
}

/** Opens a new GitHub issue for this project in a new tab, prefilled with
 *  the given title/body — the actual browser-tab-opening mechanics, shared
 *  by both the city and dungeon report-issue flows below. */
function openIssueUrl(title: string, body: string): void {
  const url = new URL(`${REPO_URL}/issues/new`)
  url.searchParams.set('title', title)
  url.searchParams.set('body', body)
  window.open(url.toString(), '_blank', 'noopener,noreferrer')
}

/** Opens a new GitHub issue for this project in a new tab, pre-filled with
 *  a description template and auto-collected environment/city context so
 *  reporters don't have to dig any of that up themselves. */
export function openReportIssue(params: GenParams): void {
  openIssueUrl('Bug: ', buildIssueBody(params))
}

/** Same idea as `buildIssueBody`, but for the dungeon tool's own param
 *  shape — a separate function rather than a generalized one because the
 *  two param types share no fields worth abstracting over (a city has
 *  districts/gates/rivers; a dungeon has levels/rooms/loot chance). */
function buildDungeonIssueBody(params: DungeonParams): string {
  const failureCount = mergeFailureCount()
  const lines = [
    'What happened?',
    '(Describe the bug, and what you expected to happen instead.)',
    '',
    '',
    'Steps to reproduce',
    '1. ',
    '2. ',
    '3. ',
    '',
    '',
    '----------------------------------------',
    "Everything below this line is filled in automatically — please leave it as-is, it helps track down the bug.",
    '',
    `Dungeon name: ${params.dungeonName}`,
    `Seed: ${params.seed}`,
    `Encounter seed: ${params.encounterSeed}`,
    `Party: level ${params.partyLevel}, ${params.partySize} members`,
    `Grid: ${params.gridWidth} x ${params.gridHeight}`,
    `Room size: ${params.minRoomSize}-${params.maxRoomSize}`,
    `Layout depth: ${params.maxDepth}`,
    `Corridor width: ${params.corridorWidth}`,
    `Loop chance: ${params.loopChance}`,
    `Loop max detour: ${params.loopMaxDetour}`,
    `Levels: ${params.levelCount}`,
    `Monster chance: ${params.monsterChance}`,
    `Loot chance: ${params.lootChance}`,
    `Browser: ${navigator.userAgent}`,
    `Window size: ${window.innerWidth} x ${window.innerHeight}`,
    ...(failureCount > 0
      ? [`Note: ${failureCount} building-merge issue(s) were also recorded automatically on this device.`]
      : []),
  ]
  const body = lines.join('\n')
  return body.length > MAX_BODY_LENGTH ? body.slice(0, MAX_BODY_LENGTH) + '\n\n(truncated)' : body
}

/** Dungeon-tool equivalent of `openReportIssue`. */
export function openDungeonReportIssue(params: DungeonParams): void {
  openIssueUrl('Bug: ', buildDungeonIssueBody(params))
}
