import React from 'react'
import { cn } from '@/lib/utils'

/**
 * A drawn landscape for a phase's cover, standing in until phases can carry a photo. The
 * horizon follows what the learner is mostly doing: hills for school, a campus tower for
 * college, a skyline for work, the coast for a gap year. Colors come from `.phase-scene`
 * in globals.css, so the scene turns to night in dark mode.
 */
const f = (v: string) => ({ fill: `var(--${v})` })

function Cloud({ x, y, s }: { x: number; y: number; s: number }) {
  return <g transform={`translate(${x} ${y}) scale(${s})`}><ellipse rx="70" ry="24" /><ellipse cx="-42" cy="8" rx="50" ry="18" /><ellipse cx="46" cy="6" rx="55" ry="20" /><ellipse cx="6" cy="-14" rx="38" ry="22" /></g>
}

function Tree({ x, round, s }: { x: number; round: boolean; s: number }) {
  return round
    ? <g transform={`translate(${x} 474) scale(${s})`}><rect x="-3" y="-26" width="6" height="26" style={f('door')} /><circle cy="-44" r="26" style={f('tree')} /><circle cx="-12" cy="-34" r="16" style={f('tree2')} /></g>
    : <g transform={`translate(${x} 474) scale(${s})`}><rect x="-3" y="-14" width="6" height="14" style={f('door')} /><path d="M0 -92 L22 -40 L12 -40 L28 -14 L-28 -14 L-12 -40 L-22 -40Z" style={f('tree2')} /></g>
}

const LAND_TREES: [number, boolean, number][] = [[70, true, 1], [118, false, 1.1], [560, true, 0.9], [608, false, 1], [1030, true, 1.1], [1090, false, 0.9], [1150, true, 1]]
const COAST_TREES: [number, boolean, number][] = [[40, false, 1.2], [96, false, 1], [160, false, 1.1], [520, false, 0.8]]
const SKYLINE: [number, number, number][] = [[70, 54, 100], [130, 40, 150], [176, 66, 86], [248, 46, 196], [300, 30, 132], [336, 76, 116], [418, 48, 168], [472, 60, 96], [538, 40, 128]]
const WAVES: [number, number][] = [[460, 400], [700, 420], [980, 396], [1080, 440], [560, 450], [860, 462]]

type Look = 'hills' | 'campus' | 'city' | 'coast'
const LOOK: Record<string, Look> = { school: 'hills', study: 'campus', work: 'city', gap: 'coast', family: 'hills', other: 'hills' }

function Far({ look }: { look: Look }) {
  if (look === 'campus') return <>
    <path style={f('far')} d="M0 340 C160 300 260 330 380 318 S600 280 720 310 C820 330 900 290 1010 300 S1140 330 1200 320 V560 H0Z" />
    <rect x="805" y="262" width="30" height="80" style={f('far2')} /><path d="M800 264 L820 232 L840 264Z" style={f('far2')} /><circle cx="820" cy="282" r="7" style={f('win')} />
  </>
  if (look === 'city') return <>
    <path style={f('far2')} d="M760 390 L930 170 L960 160 L990 175 L1150 390Z" />
    <path style={f('snow')} d="M880 234 L930 170 L960 160 L990 175 L1032 230 L1006 223 L985 242 L960 221 L935 244 L911 228Z" />
    {SKYLINE.map(([x, w, h]) => <rect key={x} x={x} y={410 - h} width={w} height={h} style={f('far')} />)}
  </>
  if (look === 'coast') return <>
    <rect y="372" width="1200" height="188" style={f('sea')} />
    {WAVES.map(([x, y]) => <path key={x} d={`M${x} ${y} q12 -6 24 0 t24 0`} style={{ stroke: 'var(--sea2)', strokeWidth: 3, fill: 'none', strokeLinecap: 'round' }} />)}
    <path d="M1110 374 L1116 300 L1134 300 L1140 374Z" style={f('house')} /><rect x="1112" y="288" width="26" height="14" style={f('roof')} />
  </>
  return <path style={f('far')} d="M0 360 C120 330 220 300 330 330 S520 360 620 320 C700 290 740 230 790 228 C840 226 880 300 960 318 S1120 330 1200 300 V560 H0Z" />
}

const STARS = Array.from({ length: 40 }, (_, i) => [(i * 197) % 1200, (i * 83) % 300, i % 3 ? 1.4 : 2.2])

export default function PhaseScene({ kind, past = false, className }: { kind?: string; past?: boolean; className?: string }) {
  const id = React.useId().replace(/:/g, '')
  const look = LOOK[kind || ''] || 'hills'
  const sunX = look === 'city' ? 300 : 905
  return <svg className={cn('phase-scene', past && 'past', className)} viewBox="0 0 1200 560" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: 'var(--sky1)' }} /><stop offset=".85" style={{ stopColor: 'var(--sky2)' }} /></linearGradient>
      <radialGradient id={`${id}r`}><stop offset="0" style={{ stopColor: 'var(--glow)', stopOpacity: 0.95 }} /><stop offset="1" style={{ stopColor: 'var(--glow)', stopOpacity: 0 }} /></radialGradient>
    </defs>
    <rect width="1200" height="560" fill={`url(#${id}g)`} />
    <g className="stars" fill="#fff">{STARS.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} />)}</g>
    <circle cx={sunX} cy="130" r="200" fill={`url(#${id}r)`} /><circle cx={sunX} cy="130" r="50" style={f('sun')} />
    <g style={f('cloud')}><Cloud x={190} y={110} s={1} /><Cloud x={640} y={70} s={0.75} /><Cloud x={1040} y={200} s={0.6} /></g>
    <Far look={look} />
    {look === 'coast'
      ? <><path style={f('mid')} d="M0 560 V408 C120 392 260 398 420 426 C520 444 560 470 600 560Z" />{COAST_TREES.map(([x, r, s]) => <Tree key={x} x={x} round={r} s={s} />)}<path style={f('road')} d="M0 472 C300 456 640 446 1200 452 V560 H0Z" /></>
      : look === 'city'
        ? <path style={f('road')} d="M0 470 C300 456 700 460 1200 470 V560 H0Z" />
        : <><path style={f('mid')} d="M0 430 C200 395 380 400 600 425 S1000 415 1200 400 V560 H0Z" />{LAND_TREES.map(([x, r, s]) => <Tree key={x} x={x} round={r} s={s} />)}<path style={f('ground')} d="M0 470 C300 452 700 458 1200 472 V560 H0Z" /></>}
  </svg>
}
