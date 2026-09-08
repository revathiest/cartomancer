import { useEffect } from 'react'
import { useDungeonStore } from './dungeonStore.ts'
import { DungeonToolbar } from './DungeonToolbar.tsx'
import { DungeonParamPanel } from './DungeonParamPanel.tsx'
import { DungeonSelectionPanel } from './DungeonSelectionPanel.tsx'
import { DungeonCanvas } from './DungeonCanvas.tsx'

export function DungeonApp({ onHome }: { onHome: () => void }) {
  const mode = useDungeonStore((s) => s.mode)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
      const store = useDungeonStore.getState()

      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) {
        if (store.selection) {
          e.preventDefault()
          store.deleteSelected()
        }
      } else if (e.key === 'Escape') {
        store.select(null)
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        store.undo()
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault()
        store.redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app">
      <DungeonToolbar onHome={onHome} />
      <div className="workspace">
        <aside className="sidebar">{mode === 'generate' ? <DungeonParamPanel /> : <DungeonSelectionPanel />}</aside>
        <main className="canvas-host">
          <DungeonCanvas />
        </main>
      </div>
    </div>
  )
}
