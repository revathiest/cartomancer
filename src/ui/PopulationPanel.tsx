import { useMemo, useState } from 'react'
import { useMapStore } from '../state/mapStore.ts'
import { estimatePopulation } from '../analysis/population.ts'

export function PopulationPanel() {
  const scene = useMapStore((s) => s.scene)
  const crowding = useMapStore((s) => s.crowding)
  const setCrowding = useMapStore((s) => s.setCrowding)
  const matchPopulation = useMapStore((s) => s.matchPopulation)
  const hasManualEdits = useMapStore((s) => s.hasManualEdits)

  const est = useMemo(() => estimatePopulation(scene, crowding), [scene, crowding])
  const [target, setTarget] = useState('')
  const [matchNote, setMatchNote] = useState<string | null>(null)
  const [matching, setMatching] = useState(false)

  const handleMatch = () => {
    const t = Number(target)
    if (!t || t <= 0) return
    if (hasManualEdits) {
      const ok = confirm('Matching population regenerates the city and discards your manual edits. Continue?')
      if (!ok) return
    }
    // The search runs several full generations synchronously (up to a couple of
    // seconds) — defer it a tick so the "Searching…" state actually paints
    // first, instead of the button just looking frozen.
    setMatching(true)
    setMatchNote(null)
    setTimeout(() => {
      const result = matchPopulation(t)
      setMatching(false)
      const boundsNote = result.clamped
        ? ` (hit the ${result.achieved < t ? 'largest' : 'smallest'} city this generator can make)`
        : ''
      setMatchNote(
        `Closest match: ${result.districtCount} districts, ${result.buildingDensity.toFixed(2)}× building density → ≈${result.achieved.toLocaleString()}${boundsNote}`,
      )
    }, 20)
  }

  return (
    <>
      <h2 className="panel-h">Population</h2>

      <div className="pop-total">
        <span className="pop-num">≈ {est.total.toLocaleString()}</span>
        <span className="pop-class">{est.classification}</span>
      </div>

      <p className="hint">
        Estimated from {est.buildingCount} buildings (their size, use, and district).
        {est.averagePerBuilding > 0 && ` ~${Math.round(est.averagePerBuilding)} residents per inhabited building.`}
      </p>

      <label className="field">
        <span>Target population</span>
        <div className="row">
          <input
            className="input"
            type="number"
            min={0}
            placeholder="e.g. 5000"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
          <button
            className="btn"
            onClick={handleMatch}
            disabled={matching}
            title="Search district count and building density for a close match"
          >
            {matching ? 'Searching…' : 'Match'}
          </button>
        </div>
      </label>
      {matchNote && <p className="hint">{matchNote}</p>}
      <p className="hint">
        Adjusts district count and building density (never crowding) and regenerates the city to
        land close to your target.
      </p>

      <label className="field">
        <span>Crowding: {crowding.toFixed(2)}×</span>
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.05}
          value={crowding}
          onChange={(e) => setCrowding(Number(e.target.value))}
        />
      </label>

      {est.byDistrictType.length > 0 && (
        <table className="pop-table">
          <thead>
            <tr>
              <th>District type</th>
              <th>Bldgs</th>
              <th>People</th>
            </tr>
          </thead>
          <tbody>
            {est.byDistrictType.map((r) => (
              <tr key={r.type}>
                <td>{r.type}</td>
                <td>{r.buildings}</td>
                <td>{r.population.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="hint">
        Raise it by adding districts, increasing a district’s <b>density</b>, or nudging
        <b> crowding</b>. Slums pack in the most people; noble and civic quarters the fewest.
      </p>
    </>
  )
}
