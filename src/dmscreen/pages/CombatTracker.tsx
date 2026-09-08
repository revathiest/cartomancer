import { useEffect, useMemo, useState } from "react";
import { conditions } from "../data/coreRules";
import { uid } from "../utils";

interface Combatant {
  id: string;
  name: string;
  init: number;
  hp: number;
  maxHp: number;
  ac: number;
  isPC: boolean;
  tags: string[];
}

const STORAGE_KEY = "dm-screen-combat-tracker-v1";

const CONDITION_NAMES = conditions.map((c) => c.name);

function loadState(): { combatants: Combatant[]; turn: number; round: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore corrupt storage */
  }
  return { combatants: [], turn: 0, round: 1 };
}

export default function CombatTracker() {
  const initial = useMemo(loadState, []);
  const [combatants, setCombatants] = useState<Combatant[]>(initial.combatants);
  const [turn, setTurn] = useState(initial.turn);
  const [round, setRound] = useState(initial.round);

  const [form, setForm] = useState({ name: "", init: "", hp: "", ac: "", isPC: false });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ combatants, turn, round }));
  }, [combatants, turn, round]);

  const sorted = [...combatants].sort((a, b) => b.init - a.init);

  function addCombatant(e: React.FormEvent) {
    e.preventDefault();
    const hp = Number(form.hp) || 0;
    const next: Combatant = {
      id: uid(),
      name: form.name.trim() || "Unnamed",
      init: Number(form.init) || 0,
      hp,
      maxHp: hp,
      ac: Number(form.ac) || 10,
      isPC: form.isPC,
      tags: [],
    };
    setCombatants((c) => [...c, next]);
    setForm({ name: "", init: "", hp: "", ac: "", isPC: false });
  }

  function removeCombatant(id: string) {
    setCombatants((c) => c.filter((x) => x.id !== id));
  }

  function adjustHp(id: string, delta: number) {
    setCombatants((c) => c.map((x) => (x.id === id ? { ...x, hp: Math.max(0, x.hp + delta) } : x)));
  }

  function toggleTag(id: string, tag: string) {
    setCombatants((c) =>
      c.map((x) =>
        x.id === id
          ? { ...x, tags: x.tags.includes(tag) ? x.tags.filter((t) => t !== tag) : [...x.tags, tag] }
          : x
      )
    );
  }

  function nextTurn() {
    if (sorted.length === 0) return;
    const next = turn + 1;
    if (next >= sorted.length) {
      setTurn(0);
      setRound((r) => r + 1);
    } else {
      setTurn(next);
    }
  }

  function prevTurn() {
    if (sorted.length === 0) return;
    const prev = turn - 1;
    if (prev < 0) {
      setTurn(Math.max(sorted.length - 1, 0));
      setRound((r) => Math.max(1, r - 1));
    } else {
      setTurn(prev);
    }
  }

  function resetEncounter() {
    setCombatants([]);
    setTurn(0);
    setRound(1);
  }

  const activeId = sorted[turn]?.id;

  return (
    <div className="page tracker-page">
      <section className="card area-add">
        <h2 className="card-title">Add Combatant</h2>
        <div className="card-body">
          <form className="row" onSubmit={addCombatant} style={{ gap: "0.35rem" }}>
            <input
              className="field"
              placeholder="Name"
              style={{ width: "7rem" }}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              className="field"
              placeholder="Init"
              type="number"
              style={{ width: "3.4rem" }}
              value={form.init}
              onChange={(e) => setForm({ ...form, init: e.target.value })}
            />
            <input
              className="field"
              placeholder="HP"
              type="number"
              style={{ width: "3.4rem" }}
              value={form.hp}
              onChange={(e) => setForm({ ...form, hp: e.target.value })}
            />
            <input
              className="field"
              placeholder="AC"
              type="number"
              style={{ width: "3.2rem" }}
              value={form.ac}
              onChange={(e) => setForm({ ...form, ac: e.target.value })}
            />
            <label className="row" style={{ fontSize: "0.72rem", gap: "0.25rem" }}>
              <input
                type="checkbox"
                checked={form.isPC}
                onChange={(e) => setForm({ ...form, isPC: e.target.checked })}
              />
              PC
            </label>
            <button className="btn primary" type="submit">
              Add
            </button>
          </form>
        </div>
      </section>

      <section className="card area-controls">
        <h2 className="card-title">Round {round}</h2>
        <div className="card-body row" style={{ alignItems: "center" }}>
          <button className="btn" onClick={prevTurn}>
            ◀ Prev
          </button>
          <button className="btn primary" onClick={nextTurn}>
            Next Turn ▶
          </button>
          <button className="btn danger" onClick={resetEncounter}>
            Reset
          </button>
          <span className="pill">{sorted.length} combatants</span>
        </div>
      </section>

      <section className="card area-list">
        <h2 className="card-title">Initiative Order</h2>
        <div className="card-body">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Name</th>
                <th>Init</th>
                <th>HP</th>
                <th>AC</th>
                <th>Conditions</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr
                  key={c.id}
                  style={{
                    background: c.id === activeId ? "rgba(212,175,55,0.14)" : undefined,
                  }}
                >
                  <td>{c.id === activeId ? "▶" : ""}</td>
                  <td>
                    {c.name}
                    {c.isPC && <span className="pill" style={{ marginLeft: "0.3rem" }}>PC</span>}
                  </td>
                  <td>{c.init}</td>
                  <td>
                    <span className="row" style={{ gap: "0.2rem" }}>
                      <button className="btn small" onClick={() => adjustHp(c.id, -1)}>
                        -
                      </button>
                      <span
                        style={{
                          minWidth: "2.4rem",
                          textAlign: "center",
                          color: c.hp === 0 ? "var(--red)" : c.hp < c.maxHp / 2 ? "var(--accent)" : "var(--green)",
                        }}
                      >
                        {c.hp}/{c.maxHp}
                      </span>
                      <button className="btn small" onClick={() => adjustHp(c.id, 1)}>
                        +
                      </button>
                      <button className="btn small" onClick={() => adjustHp(c.id, -5)}>
                        -5
                      </button>
                      <button className="btn small" onClick={() => adjustHp(c.id, 5)}>
                        +5
                      </button>
                    </span>
                  </td>
                  <td>{c.ac}</td>
                  <td>
                    <div className="row" style={{ gap: "0.15rem", maxWidth: "16rem" }}>
                      {c.tags.map((t) => (
                        <span key={t} className="pill" style={{ cursor: "pointer" }} onClick={() => toggleTag(c.id, t)}>
                          {t} ✕
                        </span>
                      ))}
                      <select
                        className="field"
                        value=""
                        style={{ fontSize: "0.66rem", padding: "0.05rem 0.2rem" }}
                        onChange={(e) => {
                          if (e.target.value) toggleTag(c.id, e.target.value);
                        }}
                      >
                        <option value="">+ tag</option>
                        {CONDITION_NAMES.filter((n) => !c.tags.includes(n)).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td>
                    <button className="btn small danger" onClick={() => removeCombatant(c.id)}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ color: "var(--text-faint)", fontStyle: "italic" }}>
                    No combatants yet — add one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
