import { useRef, useState } from 'react'
import { useDungeonStore } from './dungeonStore.ts'
import { exportPng } from '../export/exportPng.ts'
import { saveDungeonToFile, loadDungeonFromFile } from './saveLoad.ts'
import { openDungeonReportIssue } from '../feedback/reportIssue.ts'
import { DUNGEON_MAP_SVG_ID } from './DungeonCanvas.tsx'

export function DungeonToolbar({ onHome }: { onHome: () => void }) {
  const mode = useDungeonStore((s) => s.mode)
  const setMode = useDungeonStore((s) => s.setMode)
  const tool = useDungeonStore((s) => s.tool)
  const setTool = useDungeonStore((s) => s.setTool)
  const undo = useDungeonStore((s) => s.undo)
  const redo = useDungeonStore((s) => s.redo)
  const canUndo = useDungeonStore((s) => s.history.past.length > 0)
  const canRedo = useDungeonStore((s) => s.history.future.length > 0)
  const scene = useDungeonStore((s) => s.scene)
  const hasManualEdits = useDungeonStore((s) => s.hasManualEdits)
  const loadScene = useDungeonStore((s) => s.loadScene)
  const levelCount = useDungeonStore((s) => s.params.levelCount)
  const currentLevel = useDungeonStore((s) => s.currentLevel)
  const setCurrentLevel = useDungeonStore((s) => s.setCurrentLevel)
  const roomCount = useDungeonStore((s) => s.scene.rooms.filter((r) => r.level === s.currentLevel).length)

  const [exporting, setExporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fileBaseName = scene.params.dungeonName.replace(/\s+/g, '-').toLowerCase() || 'dungeon'

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportPng({
        width: scene.bounds.width,
        height: scene.bounds.height,
        size: 3000,
        fileName: `${fileBaseName}-map.png`,
        svgId: DUNGEON_MAP_SVG_ID,
      })
    } catch (err) {
      console.error(err)
      alert('Export failed: ' + (err as Error).message)
    } finally {
      setExporting(false)
    }
  }

  const handleSave = async () => {
    try {
      await saveDungeonToFile(scene, `${fileBaseName}.dnddungeon.json`)
    } catch (err) {
      console.error(err)
      alert('Save failed: ' + (err as Error).message)
    }
  }

  const handleLoadClick = () => {
    if (hasManualEdits && !confirm('Loading a dungeon replaces everything currently on screen. Continue?')) return
    fileInputRef.current?.click()
  }

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-choosing the same file next time
    if (!file) return
    try {
      const loadedScene = await loadDungeonFromFile(file)
      loadScene(loadedScene)
    } catch (err) {
      console.error(err)
      alert('Load failed: ' + (err as Error).message)
    }
  }

  return (
    <div className="toolbar">
      <button className="btn" onClick={onHome} title="Back to map type selection">
        🏠 Menu
      </button>
      <div className="toolbar-title">⚔ Cartomancer — Dungeon</div>

      <div className="seg">
        <button className={mode === 'generate' ? 'seg-btn active' : 'seg-btn'} onClick={() => setMode('generate')}>
          Generate
        </button>
        <button className={mode === 'edit' ? 'seg-btn active' : 'seg-btn'} onClick={() => setMode('edit')}>
          Edit
        </button>
      </div>

      {mode === 'edit' && (
        <>
          <div className="seg">
            <button className={tool === 'select' ? 'seg-btn active' : 'seg-btn'} onClick={() => setTool('select')}>
              Select
            </button>
            <button className={tool === 'room' ? 'seg-btn active' : 'seg-btn'} onClick={() => setTool('room')} title="Drag empty space to add a room; drag a room to move it, a corner to resize">
              Room
            </button>
            <button
              className={tool === 'corridor' ? 'seg-btn active' : 'seg-btn'}
              onClick={() => setTool('corridor')}
              title="Drag empty space to add a corridor; click near a room's wall to add or remove a door"
            >
              Corridor / Door
            </button>
          </div>
          <div className="seg">
            <button className="seg-btn" onClick={undo} disabled={!canUndo} title="Undo">
              ↶
            </button>
            <button className="seg-btn" onClick={redo} disabled={!canRedo} title="Redo">
              ↷
            </button>
          </div>
        </>
      )}

      <div className="toolbar-spacer" />

      {levelCount > 1 && (
        <div className="seg" title="Switch between stacked levels">
          {Array.from({ length: levelCount }, (_, i) => (
            <button key={i} className={i === currentLevel ? 'seg-btn active' : 'seg-btn'} onClick={() => setCurrentLevel(i)}>
              Level {i + 1}
            </button>
          ))}
        </div>
      )}

      <div className="chip" title="Rooms on the current level">
        🚪 {roomCount} rooms
      </div>

      <button className="btn" onClick={handleSave} title="Save the current dungeon to a file">
        💾 Save
      </button>

      <button className="btn" onClick={handleLoadClick} title="Load a previously saved dungeon">
        📂 Load
      </button>
      <input ref={fileInputRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={handleFileChosen} />

      <button className="btn accent" onClick={handleExport} disabled={exporting}>
        {exporting ? 'Exporting…' : '⬇ Export PNG'}
      </button>

      <button
        className="btn"
        onClick={() => openDungeonReportIssue(scene.params)}
        title="Report a bug on GitHub — opens a pre-filled issue with your browser and dungeon info attached"
      >
        🐛 Report Issue
      </button>
    </div>
  )
}
