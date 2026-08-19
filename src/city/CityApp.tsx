import { useEffect } from 'react'
import './CityApp.css'
import { MapCanvas } from '../rendering/MapCanvas.tsx'
import { Toolbar } from '../ui/Toolbar.tsx'
import { ParamPanel } from '../ui/ParamPanel.tsx'
import { DistrictsPanel } from '../ui/DistrictsPanel.tsx'
import { RoadsPanel } from '../ui/RoadsPanel.tsx'
import { PlacePanel } from '../ui/PlacePanel.tsx'
import { SelectionPanel } from '../editor/SelectionPanel.tsx'
import { useMapStore } from '../state/mapStore.ts'

export function CityApp({ onHome }: { onHome: () => void }) {
  const mode = useMapStore((s) => s.mode)
  const tool = useMapStore((s) => s.tool)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
      const store = useMapStore.getState()

      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) {
        if (store.selection) {
          e.preventDefault()
          store.deleteSelected()
        }
      } else if (e.key === 'Escape') {
        store.cancelMerge()
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
      <Toolbar onHome={onHome} />
      <div className="workspace">
        <aside className="sidebar">
          {mode === 'generate' ? (
            <ParamPanel />
          ) : tool === 'district' ? (
            <DistrictsPanel />
          ) : tool === 'roads' ? (
            <RoadsPanel />
          ) : tool === 'place' ? (
            <PlacePanel />
          ) : (
            <SelectionPanel />
          )}
        </aside>
        <main className="canvas-host">
          <MapCanvas />
        </main>
      </div>
    </div>
  )
}
