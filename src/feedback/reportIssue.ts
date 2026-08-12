import type { GenParams } from '../shared/types.ts'

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

/** Builds the markdown body for a pre-filled GitHub issue — everything
 *  useful for reproducing a bug that the reporter shouldn't have to type
 *  out by hand (browser, viewport, current city seed/params). Leaves the
 *  actual description blank for them to fill in. */
function buildIssueBody(params: GenParams): string {
  const failureCount = mergeFailureCount()
  const lines = [
    '**What happened?**',
    '',
    '<!-- Describe the bug, and what you expected instead. -->',
    '',
    '**Steps to reproduce**',
    '',
    '<!-- 1. ... 2. ... 3. ... -->',
    '',
    '---',
    '<details><summary>Environment (auto-filled)</summary>',
    '',
    `- Browser: \`${navigator.userAgent}\``,
    `- Viewport: ${window.innerWidth}×${window.innerHeight}`,
    `- City seed: ${params.seed}`,
    `- City name: ${params.cityName}`,
    '- Generation params:',
    '  ```json',
    `  ${JSON.stringify(params)}`,
    '  ```',
    ...(failureCount > 0
      ? [
          '',
          `- ⚠️ ${failureCount} merge failure(s) recorded this browser. Run \`downloadMergeFailureLog()\` in the` +
            ' devtools console and attach the downloaded file — it has everything needed to reproduce them.',
        ]
      : []),
    '',
    '</details>',
  ]
  const body = lines.join('\n')
  return body.length > MAX_BODY_LENGTH ? body.slice(0, MAX_BODY_LENGTH) + '\n\n<!-- truncated -->' : body
}

/** Opens a new GitHub issue for this project in a new tab, pre-filled with
 *  a description template and auto-collected environment/city context so
 *  reporters don't have to dig any of that up themselves. */
export function openReportIssue(params: GenParams): void {
  const url = new URL(`${REPO_URL}/issues/new`)
  url.searchParams.set('title', 'Bug: ')
  url.searchParams.set('body', buildIssueBody(params))
  window.open(url.toString(), '_blank', 'noopener,noreferrer')
}
