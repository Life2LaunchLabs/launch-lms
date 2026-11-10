/** The story editor's text form of a run's stages. Pure, so it can be unit tested. */

type After = { persona: string; stage: string } | null
export type StageLine = { title: string; goal?: string; after?: After; personas?: string[] }

/** "Title | goal | for maya, sam | after dana/invite-your-students" per line; "for" and "after" are optional, in any order. */
export function parseStageLines(text: string): StageLine[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const [title, goal = '', ...rest] = line.split('|').map((part) => part.trim())
    let after: After = null
    let personas: string[] = []
    for (const part of rest) {
      const wait = part.match(/^after\s+@?([^/\s]+)\s*\/\s*(\S+)$/i)
      if (wait) after = { persona: wait[1].toLowerCase(), stage: wait[2].toLowerCase() }
      const who = part.match(/^for\s+(.+)$/i)
      if (who) personas = who[1].split(/[,\s]+/).map((handle) => handle.replace(/^@/, '').toLowerCase()).filter(Boolean)
    }
    return { title, goal, after, personas }
  })
}

export function stageLines(stages: (StageLine & { goal: string })[]): string {
  return stages.map((stage) => {
    const parts = [stage.title, stage.goal]
    if (stage.personas?.length) parts.push(`for ${stage.personas.join(', ')}`)
    if (stage.after) parts.push(`after ${stage.after.persona}/${stage.after.stage}`)
    return parts.join(' | ')
  }).join('\n')
}
