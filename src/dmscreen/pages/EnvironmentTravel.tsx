import { Fragment, useState } from "react";
import { movementExploration, sizes, sizesNote } from "../data/coreRules";
import {
  audibleDistance,
  audibleDistanceNote,
  dressingFloor,
  dressingFloorSound,
  dressingLight,
  dressingSmell,
  dressingSound,
  dressingTemp,
  foodDrinkLodging,
  foodDrinkLodgingNote,
  lightSources,
  lightSourcesNote,
  terrainDCs,
  terrainDCsNote,
  travelPace,
  travelTerrain,
  travelTerrainNote,
  visibilityOutdoors,
  visibilityOutdoorsNote,
  weatherPrecipitation,
  weatherPrecipitationRoll,
  weatherRollNote,
  weatherTemperature,
  weatherTemperatureRoll,
  weatherWind,
  weatherWindRoll,
} from "../data/environment";
import { pick } from "../utils";

function rollWeather() {
  return {
    temp: pick(weatherTemperature),
    wind: pick(weatherWind),
    precip: pick(weatherPrecipitation),
  };
}

function rollDressing(): string[] {
  return [
    `A smell of ${pick(dressingSmell)} hangs in the air.`,
    `The light here is ${pick(dressingLight)}.`,
    `The floor is ${pick(dressingFloor)}, and it ${pick(dressingFloorSound)} underfoot.`,
    `Somewhere nearby, ${pick(dressingSound)}.`,
    `The air feels noticeably ${pick(dressingTemp)} than the last room.`,
  ];
}

function TravelTerrain() {
  return (
    <section className="card">
      <h2 className="card-title">Travel Terrain</h2>
      <div className="card-body">
        <table>
          <thead>
            <tr>
              <th>Terrain</th>
              <th>Pace</th>
              <th>Enc. Dist.</th>
              <th>Forage</th>
              <th>Nav</th>
              <th>Search</th>
            </tr>
          </thead>
          <tbody>
            {travelTerrain.map((t) => (
              <tr key={t.terrain}>
                <td>{t.terrain}</td>
                <td>{t.maxPace}</td>
                <td>{t.dist}</td>
                <td>{t.forage}</td>
                <td>{t.nav}</td>
                <td>{t.search}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="card-note">{travelTerrainNote}</p>
    </section>
  );
}

function AudibleDistance() {
  return (
    <section className="card">
      <h2 className="card-title">Audible Distance</h2>
      <div className="card-body">
        <table>
          <tbody>
            {audibleDistance.map((a) => (
              <tr key={a.noise}>
                <td>{a.noise}</td>
                <td>{a.distance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="card-note">{audibleDistanceNote}</p>
    </section>
  );
}

function VisibilityOutdoors() {
  return (
    <section className="card">
      <h2 className="card-title">Visibility Outdoors</h2>
      <div className="card-body">
        <table>
          <tbody>
            {visibilityOutdoors.map((v) => (
              <tr key={v.conditions}>
                <td>{v.conditions}</td>
                <td>{v.distance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="card-note">{visibilityOutdoorsNote}</p>
    </section>
  );
}

function FoodDrinkLodging() {
  return (
    <section className="card">
      <h2 className="card-title">Food, Drink &amp; Lodging</h2>
      <div className="card-body">
        <table>
          <tbody>
            {foodDrinkLodging.items.map((i) => (
              <tr key={i.item}>
                <td>{i.item}</td>
                <td>{i.cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ alignItems: "flex-start", marginTop: "0.3rem", gap: "0.8rem" }}>
          <table>
            <thead>
              <tr>
                <th colSpan={2}>Meal</th>
              </tr>
            </thead>
            <tbody>
              {foodDrinkLodging.meal.map((m) => (
                <tr key={m.tier}>
                  <td>{m.tier}</td>
                  <td>{m.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table>
            <thead>
              <tr>
                <th colSpan={2}>Inn / Day</th>
              </tr>
            </thead>
            <tbody>
              {foodDrinkLodging.innStay.map((i) => (
                <tr key={i.tier}>
                  <td>{i.tier}</td>
                  <td>{i.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="card-note">{foodDrinkLodgingNote}</p>
    </section>
  );
}

function MovementExploration() {
  return (
    <section className="card">
      <h2 className="card-title">Movement &amp; Exploration</h2>
      <div className="card-body">
        <dl className="kv">
          {movementExploration.map((m) => (
            <Fragment key={m.name}>
              <dt>{m.name}</dt>
              <dd>{m.desc}</dd>
            </Fragment>
          ))}
        </dl>
      </div>
    </section>
  );
}

function LightSources() {
  return (
    <section className="card">
      <h2 className="card-title">Light Sources</h2>
      <div className="card-body">
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Bright</th>
              <th>Dim</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {lightSources.map((l) => (
              <tr key={l.source}>
                <td>{l.source}</td>
                <td>{l.bright}</td>
                <td>{l.dim}</td>
                <td>{l.duration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="card-note">{lightSourcesNote}</p>
    </section>
  );
}

function TerrainDCs() {
  return (
    <section className="card">
      <h2 className="card-title">Terrain &amp; Task DCs</h2>
      <div className="card-body">
        <table>
          <tbody>
            {terrainDCs.map((t) => (
              <tr key={t.task}>
                <td>{t.task}</td>
                <td>{t.dc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="card-note">{terrainDCsNote}</p>
    </section>
  );
}

function Sizes() {
  return (
    <section className="card">
      <h2 className="card-title">Sizes</h2>
      <div className="card-body">
        <table>
          <tbody>
            {sizes.map((s) => (
              <tr key={s.size}>
                <td>{s.size}</td>
                <td>{s.space}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="card-note">{sizesNote}</p>
    </section>
  );
}

function TravelPace() {
  return (
    <section className="card">
      <h2 className="card-title">Travel Pace</h2>
      <div className="card-body">
        <table>
          <thead>
            <tr>
              <th>Pace</th>
              <th>/min</th>
              <th>/hour</th>
              <th>/day</th>
            </tr>
          </thead>
          <tbody>
            {travelPace.map((p) => (
              <tr key={p.pace}>
                <td>{p.pace}</td>
                <td>{p.perMinute}</td>
                <td>{p.perHour}</td>
                <td>{p.perDay}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="tight-list" style={{ marginTop: "0.2rem" }}>
          {travelPace.map((p) => (
            <li key={p.pace}>
              <strong>{p.pace}:</strong> {p.effect}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function WeatherD20() {
  return (
    <section className="card">
      <h2 className="card-title">Weather (d20)</h2>
      <div className="card-body">
        <table>
          <thead>
            <tr>
              <th>d20</th>
              <th>Temperature</th>
            </tr>
          </thead>
          <tbody>
            {weatherTemperatureRoll.map((w) => (
              <tr key={w.roll}>
                <td>{w.roll}</td>
                <td>{w.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table style={{ marginTop: "0.3rem" }}>
          <thead>
            <tr>
              <th>d20</th>
              <th>Wind</th>
              <th>Precipitation</th>
            </tr>
          </thead>
          <tbody>
            {weatherWindRoll.map((w, i) => (
              <tr key={w.roll}>
                <td>{w.roll}</td>
                <td>{w.result}</td>
                <td>{weatherPrecipitationRoll[i].result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="card-note">{weatherRollNote}</p>
    </section>
  );
}

export default function EnvironmentTravel() {
  const [weather, setWeather] = useState(rollWeather());
  const [dressing, setDressing] = useState(rollDressing());

  return (
    <div className="page masonry-row">
      <div className="masonry-col">
        <TravelTerrain />
        <Sizes />
        <AudibleDistance />
      </div>

      <div className="masonry-col">
        <FoodDrinkLodging />
        <WeatherD20 />
        <VisibilityOutdoors />
      </div>

      <div className="masonry-col">
        <MovementExploration />
        <LightSources />
        <section className="card">
          <h2 className="card-title">
            Weather Roller
            <button className="btn small primary" onClick={() => setWeather(rollWeather())}>
              🎲 Reroll
            </button>
          </h2>
          <div className="gen-output">
            <dl className="kv">
              <dt>Temp</dt>
              <dd>{weather.temp}</dd>
              <dt>Wind</dt>
              <dd>{weather.wind}</dd>
              <dt>Sky</dt>
              <dd>{weather.precip}</dd>
            </dl>
          </div>
        </section>
      </div>

      <div className="masonry-col">
        <TerrainDCs />
        <section className="card">
          <h2 className="card-title">
            Room Dressing
            <button className="btn small primary" onClick={() => setDressing(rollDressing())}>
              🎲 Reroll
            </button>
          </h2>
          <div className="gen-output">
            <ul className="tight-list">
              {dressing.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
        </section>
        <TravelPace />
      </div>
    </div>
  );
}
