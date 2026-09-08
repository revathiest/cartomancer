import { Fragment } from "react";
import {
  combatActions,
  combatActionsNote,
  conditions,
  conditionsNote,
  coverNote,
  coverTable,
  damageTypes,
  damageTypesNote,
  dcNote,
  dcTable,
  deathSaves,
  exhaustionLevels,
  exhaustionNote,
  inspirationNote,
  lightVision,
  lightVisionNote,
  restRules,
  skillsByAbility,
  skillsByAbilityNote,
} from "../data/coreRules";

function Conditions() {
  return (
    <section className="card">
      <h2 className="card-title">Conditions</h2>
      <div className="card-body">
        <dl className="kv">
          {conditions.map((c) => (
            <Fragment key={c.name}>
              <dt>{c.name}</dt>
              <dd>{c.effect}</dd>
            </Fragment>
          ))}
        </dl>
      </div>
      <p className="card-note">{conditionsNote}</p>
    </section>
  );
}

function Cover() {
  return (
    <section className="card">
      <h2 className="card-title">Cover</h2>
      <div className="card-body">
        <ul className="tight-list">
          {coverTable.map((c) => (
            <li key={c.name}>
              <strong>{c.name}</strong> — {c.bonus}
              <br />
              <span style={{ color: "var(--text-faint)" }}>{c.example}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="card-note">{coverNote}</p>
    </section>
  );
}

function Actions() {
  return (
    <section className="card">
      <h2 className="card-title">Actions in Combat</h2>
      <div className="card-body">
        <dl className="kv">
          {combatActions.map((a) => (
            <Fragment key={a.name}>
              <dt>{a.name}</dt>
              <dd>{a.desc}</dd>
            </Fragment>
          ))}
        </dl>
      </div>
      <p className="card-note">{combatActionsNote}</p>
    </section>
  );
}

function Exhaustion() {
  return (
    <section className="card">
      <h2 className="card-title">Exhaustion (2024)</h2>
      <div className="card-body">
        <table>
          <thead>
            <tr>
              <th>Lvl</th>
              <th>D20 Tests</th>
              <th>Speed</th>
            </tr>
          </thead>
          <tbody>
            {exhaustionLevels.map((e) => (
              <tr key={e.level}>
                <td>{e.level}</td>
                <td>{e.death ? "Death" : e.d20}</td>
                <td>{e.death ? "—" : e.speed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="card-note">{exhaustionNote}</p>
    </section>
  );
}

function DCs() {
  return (
    <section className="card">
      <h2 className="card-title">Difficulty Classes</h2>
      <div className="card-body">
        <table>
          <tbody>
            {dcTable.map((d) => (
              <tr key={d.label}>
                <td>{d.label}</td>
                <td>{d.dc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="card-note">{dcNote}</p>
    </section>
  );
}

function DamageTypes() {
  return (
    <section className="card">
      <h2 className="card-title">Damage Types</h2>
      <div className="card-body">
        <dl className="kv">
          {damageTypes.map((d) => (
            <Fragment key={d.name}>
              <dt>{d.name}</dt>
              <dd>{d.note}</dd>
            </Fragment>
          ))}
        </dl>
      </div>
      <p className="card-note">{damageTypesNote}</p>
    </section>
  );
}

function SkillsByAbility() {
  return (
    <section className="card">
      <h2 className="card-title">Skills by Ability</h2>
      <div className="card-body">
        <dl className="kv">
          {skillsByAbility.map((s) => (
            <Fragment key={s.ability}>
              <dt>{s.ability}</dt>
              <dd>{s.skills}</dd>
            </Fragment>
          ))}
        </dl>
      </div>
      <p className="card-note">{skillsByAbilityNote}</p>
    </section>
  );
}

function Resting() {
  return (
    <section className="card">
      <h2 className="card-title">Resting, Dying &amp; Inspiration</h2>
      <div className="card-body">
        <dl className="kv">
          {restRules.map((r) => (
            <Fragment key={r.name}>
              <dt>{r.name}</dt>
              <dd>
                <em style={{ color: "var(--text-faint)" }}>{r.duration}</em> — {r.effect}
              </dd>
            </Fragment>
          ))}
        </dl>
        <p style={{ marginTop: "0.35rem", fontWeight: 700, color: "var(--accent-dim)" }}>{deathSaves.title}</p>
        <ul className="tight-list">
          {deathSaves.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p className="card-note">{inspirationNote}</p>
      </div>
    </section>
  );
}

function LightVision() {
  return (
    <section className="card">
      <h2 className="card-title">Light &amp; Vision</h2>
      <div className="card-body">
        <dl className="kv">
          {lightVision.map((l) => (
            <Fragment key={l.name}>
              <dt>{l.name}</dt>
              <dd>{l.effect}</dd>
            </Fragment>
          ))}
        </dl>
      </div>
      <p className="card-note">{lightVisionNote}</p>
    </section>
  );
}

export default function CoreRules() {
  return (
    <div className="page masonry-row">
      <div className="masonry-col">
        <Conditions />
      </div>
      <div className="masonry-col">
        <Resting />
        <Exhaustion />
        <Cover />
      </div>
      <div className="masonry-col">
        <LightVision />
        <SkillsByAbility />
        <DCs />
      </div>
      <div className="masonry-col">
        <Actions />
        <DamageTypes />
      </div>
    </div>
  );
}
