import { useMemo, useRef, useState } from 'react'
import { useMapStore } from '../state/mapStore.ts'
import { exportPng } from '../export/exportPng.ts'
import { loadMapFromFile, saveMapToFile } from '../export/saveLoad.ts'
import { estimatePopulation } from '../analysis/population.ts'

export function Toolbar() {
  const mode = useMapStore((s) => s.mode)
  const setMode = useMapStore((s) => s.setMode)
  const tool = useMapStore((s) => s.tool)
  const setTool = useMapStore((s) => s.setTool)
  const undo = useMapStore((s) => s.undo)
  const redo = useMapStore((s) => s.redo)
  const canUndo = useMapStore((s) => s.history.past.length > 0)
  const canRedo = useMapStore((s) => s.history.future.length > 0)
  const cityName = useMapStore((s) => s.scene.params.cityName)
  const showDistrictFills = useMapStore((s) => s.showDistrictFills)
  const setShowDistrictFills = useMapStore((s) => s.setShowDistrictFills)
  const scene = useMapStore((s) => s.scene)
  const hasManualEdits = useMapStore((s) => s.hasManualEdits)
  const loadScene = useMapStore((s) => s.loadScene)
  const crowding = useMapStore((s) => s.crowding)
  const population = useMemo(() => estimatePopulation(scene, crowding), [scene, crowding])

  const [exporting, setExporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportPng({
        width: scene.bounds.width,
        height: scene.bounds.height,
        size: 3000,
        fileName: `${cityName.replace(/\s+/g, '-').toLowerCase() || 'city'}-map.png`,
      })
    } catch (err) {
      console.error(err)
      alert('Export failed: ' + (err as Error).message)
    } finally {
      setExporting(false)
    }
  }

  const handleSave = () => {
    saveMapToFile(scene, `${cityName.replace(/\s+/g, '-').toLowerCase() || 'city'}.dndmap.json`)
  }

  const handleLoadClick = () => {
    if (hasManualEdits && !confirm('Loading a map replaces everything currently on screen. Continue?')) return
    fileInputRef.current?.click()
  }

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-choosing the same file next time
    if (!file) return
    try {
      const loadedScene = await loadMapFromFile(file)
      loadScene(loadedScene)
    } catch (err) {
      console.error(err)
      alert('Load failed: ' + (err as Error).message)
    }
  }

  return (
    <div className="toolbar">
      <div className="toolbar-title">⚔ Cartomancer</div>

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
            <button className={tool === 'district' ? 'seg-btn active' : 'seg-btn'} onClick={() => setTool('district')}>
              Districts
            </button>
            <button className={tool === 'roads' ? 'seg-btn active' : 'seg-btn'} onClick={() => setTool('roads')}>
              Roads
            </button>
            <button className={tool === 'place' ? 'seg-btn active' : 'seg-btn'} onClick={() => setTool('place')}>
              Place
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

      <div className="pop-chip" title={`${population.classification} · estimated resident population`}>
        👥 ≈ {population.total.toLocaleString()}
      </div>

      <button
        className={showDistrictFills ? 'btn' : 'btn accent'}
        onClick={() => setShowDistrictFills(!showDistrictFills)}
        title="Toggle district background fills"
      >
        {showDistrictFills ? '◨ District fills: on' : '◧ District fills: off'}
      </button>

      <button className="btn" onClick={handleSave} title="Save the current map to a file">
        💾 Save
      </button>

      <button className="btn" onClick={handleLoadClick} title="Load a previously saved map">
        📂 Load
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleFileChosen}
      />

      <button className="btn accent" onClick={handleExport} disabled={exporting}>
        {exporting ? 'Exporting…' : '⬇ Export PNG'}
      </button>
    </div>
  )
}
