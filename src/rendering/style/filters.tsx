import { DISTRICT_STYLES, THEME } from './theme.ts'
import { DISTRICT_TYPES } from '../../shared/types.ts'

export const MAP_FONT = "'MedievalSharp', 'IM Fell English', Georgia, serif"

/**
 * Shared SVG <defs>: paper grain, hand-drawn displacement, vignette, water
 * gradient, and one diagonal hatch pattern per district type.
 */
export function MapDefs() {
  return (
    <defs>
      {/* Aged-paper grain, tinted and softened so it reads as texture not noise. */}
      <filter id="paper-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
        <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0.42 0 0 0 0 0.32 0 0 0 0 0.18 0 0 0 0.06 0" />
      </filter>

      {/* Hand-drawn displacement — layered over stroked line groups. */}
      <filter id="rough" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="12" result="warp" />
        <feDisplacementMap in="SourceGraphic" in2="warp" scale="6" xChannelSelector="R" yChannelSelector="G" />
      </filter>

      <radialGradient id="vignette" cx="50%" cy="50%" r="72%">
        <stop offset="55%" stopColor="#000000" stopOpacity="0" />
        <stop offset="100%" stopColor="#3a2c1c" stopOpacity="0.32" />
      </radialGradient>

      <linearGradient id="water-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={THEME.water} />
        <stop offset="100%" stopColor={THEME.waterDeep} />
      </linearGradient>

      {DISTRICT_TYPES.map((type) => {
        const s = DISTRICT_STYLES[type]
        return (
          <pattern
            key={s.hatch}
            id={s.hatch}
            patternUnits="userSpaceOnUse"
            width="12"
            height="12"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="12" stroke={s.stroke} strokeWidth="1.1" strokeOpacity="0.28" />
          </pattern>
        )
      })}
    </defs>
  )
}
