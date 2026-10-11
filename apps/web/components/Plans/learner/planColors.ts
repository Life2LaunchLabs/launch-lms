export type PlanTone = {
  /** The plan's own color, used for rings, dots and art tiles. */
  ring: string
  /** Darker shade for text and outlines on light backgrounds. */
  main: string
  /** Light card background. */
  tint: string
  /** The 3D bottom edge under a card. */
  edge: string
}

function mix(hex: string, target: [number, number, number], amount: number) {
  const value = hex.replace('#', '')
  const channels = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16))
  const mixed = channels.map((channel, index) => Math.round(channel + (target[index] - channel) * amount))
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

export function planTone(color: string): PlanTone {
  const ring = /^#[0-9a-f]{6}$/i.test(color) ? color : '#7c3aed'
  return {
    ring,
    main: mix(ring, [0, 0, 0], 0.28),
    tint: mix(ring, [255, 255, 255], 0.86),
    edge: mix(ring, [255, 255, 255], 0.62),
  }
}
