import { useEffect, useState } from "react";
import "./dmscreen.css";
import CoreRules from "./pages/CoreRules";
import CombatTracker from "./pages/CombatTracker";
import MonsterReference from "./pages/MonsterReference";
import Generators from "./pages/Generators";
import EnvironmentTravel from "./pages/EnvironmentTravel";
import { openDMScreenReportIssue } from "../feedback/reportIssue.ts";

const PAGES = [
  { key: "rules", label: "Core Rules", component: CoreRules },
  { key: "environment", label: "Environment & Travel", component: EnvironmentTravel },
  { key: "monsters", label: "Monsters & XP", component: MonsterReference },
  { key: "generators", label: "Generators", component: Generators },
  { key: "tracker", label: "Combat Tracker", component: CombatTracker },
];

export function DMScreenApp({ onHome }: { onHome: () => void }) {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key >= "1" && e.key <= "5") {
        setActiveIdx(Number(e.key) - 1);
      } else if (e.key === "ArrowRight") {
        setActiveIdx((i) => Math.min(i + 1, PAGES.length - 1));
      } else if (e.key === "ArrowLeft") {
        setActiveIdx((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ActivePage = PAGES[activeIdx].component;

  return (
    <div className="app dmscreen">
      <div className="toolbar">
        <button className="btn" onClick={onHome} title="Back to map type selection">
          🏠 Menu
        </button>
        <div className="toolbar-title">⚔ Cartomancer — DM Screen</div>
        <div className="toolbar-spacer" />
        <div className="seg wrap" title="Switch reference page">
          {PAGES.map((p, idx) => (
            <button
              key={p.key}
              className={idx === activeIdx ? "seg-btn active" : "seg-btn"}
              onClick={() => setActiveIdx(idx)}
              title={`Alt: press ${idx + 1}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          className="btn"
          onClick={() => openDMScreenReportIssue(PAGES[activeIdx].label)}
          title="Report a bug on GitHub — opens a pre-filled issue with your browser info attached"
        >
          🐛 Report Issue
        </button>
      </div>
      <main className="dmscreen-main">
        <ActivePage />
      </main>
    </div>
  );
}
