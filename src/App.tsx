import { useState } from 'react'
import { Landing } from './ui/Landing.tsx'
import { CityApp } from './city/CityApp.tsx'
import { DungeonApp } from './dungeon/DungeonApp.tsx'

type Page = 'landing' | 'city' | 'dungeon'

export default function App() {
  const [page, setPage] = useState<Page>('landing')

  if (page === 'city') return <CityApp onHome={() => setPage('landing')} />
  if (page === 'dungeon') return <DungeonApp onHome={() => setPage('landing')} />
  return <Landing onSelectCity={() => setPage('city')} onSelectDungeon={() => setPage('dungeon')} />
}
