export type PlanTone = {
  /** The plan's own color, used for rings, dots, tints and the plan header. */
  ring: string
  /** Black or white, whichever reads on ``ring``. */
  foreground: string
}

export function planTone(color: string): PlanTone {
  const ring = /^#[0-9a-f]{6}$/i.test(color) ? color : '#7c3aed'
  const linear = [0, 2, 4].map((offset) => parseInt(ring.slice(offset + 1, offset + 3), 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
  return { ring, foreground: luminance > 0.179 ? '#000000' : '#ffffff' }
}
