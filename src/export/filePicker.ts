/** Result of a save attempt via the native file picker. */
export type SavePickerResult = 'saved' | 'cancelled' | 'unsupported'

/**
 * Saves `blob` via the File System Access API's native "Save As" dialog
 * (lets the user pick a directory, not just a filename) where the browser
 * supports it — Chromium-based browsers only; Firefox and Safari don't
 * implement it. Callers should fall back to `downloadBlob` when this
 * returns 'unsupported'. A user-cancelled dialog resolves to 'cancelled'
 * rather than throwing, since that's not an error worth surfacing.
 */
export async function saveBlobWithPicker(
  blob: Blob,
  opts: { suggestedName: string; description: string; mimeType: `${string}/${string}`; extensions: `.${string}`[] },
): Promise<SavePickerResult> {
  if (!('showSaveFilePicker' in window)) return 'unsupported'
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: opts.suggestedName,
      types: [{ description: opts.description, accept: { [opts.mimeType]: opts.extensions } }],
    })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return 'saved'
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
    throw err
  }
}

/** Plain browser download (the original behaviour) — always goes to the
 *  browser's configured downloads location, no directory choice. Used as
 *  the fallback when the native picker isn't available. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** Saves `blob` via the native picker when available, otherwise falls back
 *  to a plain download. A user-cancelled picker is treated as a no-op, same
 *  as cancelling a browser's download prompt. */
export async function saveBlob(
  blob: Blob,
  opts: { suggestedName: string; description: string; mimeType: `${string}/${string}`; extensions: `.${string}`[] },
): Promise<void> {
  const result = await saveBlobWithPicker(blob, opts)
  if (result === 'unsupported') downloadBlob(blob, opts.suggestedName)
}
