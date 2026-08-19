import './Landing.css'

export function Landing({ onSelectCity, onSelectDungeon }: { onSelectCity: () => void; onSelectDungeon: () => void }) {
  return (
    <div className="landing">
      <div className="landing-hero">
        <div className="landing-title">⚔ Cartomancer</div>
        <p className="landing-tagline">Welcome, Dungeon Master.</p>
        <p className="landing-intro">
          Cartomancer builds a usable map in seconds — a full city or a dungeon floor plan — from a seeded,
          procedural generator. From there, every piece stays yours to reshape by hand: move a road, add a
          landmark, lock a door, mark the room that lured the party in. Generate the bulk of the work away,
          then spend your time only on the details your story actually needs.
        </p>
      </div>

      <p className="landing-subtitle">What are you mapping today?</p>

      <div className="landing-cards">
        <button className="landing-card" onClick={onSelectCity}>
          <div className="landing-card-icon">🏰</div>
          <div className="landing-card-title">City</div>
          <p className="landing-card-desc">
            Generate a full city — districts, roads, a river, a wall, and buildings — then edit it by hand.
          </p>
        </button>

        <button className="landing-card" onClick={onSelectDungeon}>
          <div className="landing-card-icon">⚒</div>
          <div className="landing-card-title">Dungeon</div>
          <p className="landing-card-desc">
            Carve a dungeon layout — rooms, corridors, doors, and stairs between levels — from a seeded,
            randomized floor plan.
          </p>
        </button>
      </div>
    </div>
  )
}
