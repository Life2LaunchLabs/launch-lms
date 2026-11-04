// The chips the skills and values picker offers, in groups. A plain module (not a client one), so server
// code that reads result templates gets the real lists.

export type CategorizedOption = { id: string; text: string; category?: string }

export const PORTFOLIO_VALUES: CategorizedOption[] = [
  ['Personal Growth', ['Achievement', 'Adventure', 'Curiosity', 'Creativity', 'Growth', 'Learning', 'Excellence', 'Independence']],
  ['Relationships', ['Belonging', 'Compassion', 'Friendship', 'Family', 'Generosity', 'Kindness', 'Love', 'Respect', 'Trust']],
  ['Character', ['Authenticity', 'Courage', 'Fairness', 'Gratitude', 'Honesty', 'Integrity', 'Responsibility', 'Perseverance']],
  ['Lifestyle', ['Balance', 'Freedom', 'Fun', 'Health', 'Joy', 'Simplicity', 'Stability', 'Wellbeing']],
  ['Purpose & Impact', ['Community', 'Contribution', 'Justice', 'Leadership', 'Nature', 'Service', 'Sustainability', 'Wisdom']],
].flatMap(([category, items]) => (items as string[]).map((text) => ({ id: text.toLowerCase().replace(/\W+/g, '-'), text, category: category as string })))

export const PORTFOLIO_STRENGTHS: CategorizedOption[] = [
  ['Thinking', ['Analysis', 'Strategy', 'Problem solving', 'Systems thinking', 'Decision making']],
  ['Creating', ['Storytelling', 'Design sense', 'Experimentation', 'Originality', 'Making ideas real']],
  ['Working With Others', ['Collaboration', 'Facilitation', 'Mentoring', 'Listening', 'Conflict navigation']],
  ['Execution', ['Focus', 'Follow-through', 'Organization', 'Adaptability', 'Initiative']],
].flatMap(([category, items]) => (items as string[]).map((text) => ({ id: text.toLowerCase().replace(/\W+/g, '-'), text, category: category as string })))
