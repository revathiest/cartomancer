import { useDungeonStore } from './dungeonStore.ts'
import { DungeonParamPanel } from './DungeonParamPanel.tsx'
import { DungeonCanvas } from './DungeonCanvas.tsx'

export function DungeonApp({ onHome }: { onHome: () => void }) {
  const levelCount = useDungeonStore((s) => s.params.levelCount)
  const currentLevel = useDungeonStore((s) => s.currentLevel)
  const setCurrentLevel = useDungeonStore((s) => s.setCurrentLevel)
  const roomCount = useDungeonStore((s) => s.scene.rooms.filter((r) => r.level === s.currentLevel).length)

  return (
    <div className="app">
      <div className="toolbar">
        <button className="btn" onClick={onHome} title="Back to map type selection">
          🏠 Menu
        </button>
        <div className="toolbar-title">⚔ Cartomancer — Dungeon</div>
        <div className="toolbar-spacer" />
        {levelCount > 1 && (
          <div className="seg" title="Switch between stacked levels">
            {Array.from({ length: levelCount }, (_, i) => (
              <button
                key={i}
                className={i === currentLevel ? 'seg-btn active' : 'seg-btn'}
                onClick={() => setCurrentLevel(i)}
              >
                Level {i + 1}
              </button>
            ))}
          </div>
        )}
        <div className="chip" title="Rooms on the current level">
          🚪 {roomCount} rooms
        </div>
      </div>
      <div className="workspace">
        <aside className="sidebar">
          <DungeonParamPanel />
        </aside>
        <main className="canvas-host">
          <DungeonCanvas />
        </main>
      </div>
    </div>
  )
}
