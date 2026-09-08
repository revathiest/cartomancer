import { Fragment } from "react";
import {
  crXpNote,
  crXpTable,
  encounterNote,
  improvisedDamage,
  improvisedDamageTierMeaning,
  improvisingDamageExamples,
  lairActionNote,
  legendaryActionNote,
  objectAC,
  objectHP,
  objectNote,
  proficiencyByCR,
  proficiencyByCRNote,
  xpBudgetByLevel,
} from "../data/monsterRef";

export default function MonsterReference() {
  return (
    <div className="page masonry-row">
      <div className="masonry-col">
        <section className="card">
          <h2 className="card-title">CR → XP</h2>
          <div className="card-body">
            <table>
              <thead>
                <tr>
                  <th>CR</th>
                  <th>XP</th>
                </tr>
              </thead>
              <tbody>
                {crXpTable.map((r) => (
                  <tr key={r.cr}>
                    <td>{r.cr}</td>
                    <td>{r.xp.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="card-note">{crXpNote}</p>
        </section>
      </div>

      <div className="masonry-col">
        <section className="card">
          <h2 className="card-title">Encounter XP Budget (per character)</h2>
          <div className="card-body">
            <table>
              <thead>
                <tr>
                  <th>Lvl</th>
                  <th>Low</th>
                  <th>Moderate</th>
                  <th>High</th>
                </tr>
              </thead>
              <tbody>
                {xpBudgetByLevel.map((r) => (
                  <tr key={r.level}>
                    <td>{r.level}</td>
                    <td>{r.low.toLocaleString()}</td>
                    <td>{r.moderate.toLocaleString()}</td>
                    <td>{r.high.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="card-note">{encounterNote}</p>
        </section>
      </div>

      <div className="masonry-col">
        <section className="card">
          <h2 className="card-title">Proficiency by CR</h2>
          <div className="card-body">
            <table>
              <tbody>
                {proficiencyByCR.map((r) => (
                  <tr key={r.range}>
                    <td>{r.range}</td>
                    <td>{r.pb}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="card-note">{proficiencyByCRNote}</p>
        </section>

        <section className="card">
          <h2 className="card-title">Legendary &amp; Lair Actions</h2>
          <div className="card-body">
            <p>
              <strong style={{ color: "var(--accent-dim)" }}>Legendary Actions:</strong> {legendaryActionNote}
            </p>
            <p style={{ marginTop: "0.3rem" }}>
              <strong style={{ color: "var(--accent-dim)" }}>Lair Actions:</strong> {lairActionNote}
            </p>
          </div>
        </section>
      </div>

      <div className="masonry-col">
        <section className="card">
          <h2 className="card-title">Improvised Damage</h2>
          <div className="card-body">
            <table>
              <thead>
                <tr>
                  <th>Level</th>
                  <th>Nuisance</th>
                  <th>Deadly</th>
                </tr>
              </thead>
              <tbody>
                {improvisedDamage.map((d) => (
                  <tr key={d.levelTier}>
                    <td>{d.levelTier}</td>
                    <td>{d.nuisance}</td>
                    <td>{d.deadly}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="tight-list" style={{ marginTop: "0.3rem" }}>
              {improvisedDamageTierMeaning.map((t) => (
                <li key={t.tier}>
                  <strong>{t.tier}:</strong> {t.meaning}
                </li>
              ))}
            </ul>
          </div>
          <p className="card-note">
            For an action with no listed damage — a shove off a ledge, dropping a chandelier, etc. Cross-reference the target's level, then roll.
          </p>
        </section>

        <section className="card">
          <h2 className="card-title">Improvising Damage — Examples</h2>
          <div className="card-body">
            <dl className="kv">
              {improvisingDamageExamples.map((e) => (
                <Fragment key={e.dice}>
                  <dt>{e.dice}</dt>
                  <dd>{e.examples}</dd>
                </Fragment>
              ))}
            </dl>
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Object AC &amp; HP</h2>
          <div className="card-body">
            <table>
              <tbody>
                {objectAC.map((o) => (
                  <tr key={o.ac}>
                    <td>{o.ac}</td>
                    <td>{o.substance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table style={{ marginTop: "0.3rem" }}>
              <thead>
                <tr>
                  <th>Size</th>
                  <th>Fragile</th>
                  <th>Resilient</th>
                </tr>
              </thead>
              <tbody>
                {objectHP.map((o) => (
                  <tr key={o.size}>
                    <td>{o.size}</td>
                    <td>{o.fragile}</td>
                    <td>{o.resilient}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="card-note">{objectNote}</p>
        </section>
      </div>
    </div>
  );
}
