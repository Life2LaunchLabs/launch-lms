// The chips the skills and values picker offers, in groups. A plain module (not a client one), so server
// code that reads result templates gets the real lists. Each skill's id (its words, lower-cased, with dashes) is
// matched to O*NET's skills and work styles in the API's services/life_plans/skill_words.py, which is how a
// career page says which of your skills a job uses: keep the two in step.

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
  ['Working With Others', ['Collaboration', 'Facilitation', 'Mentoring', 'Listening', 'Conflict navigation', 'Reading people', 'Explaining things', 'Helping out', 'Persuading', 'Leading a group']],
  ['Hands-On', ['Fixing things', 'Finding what’s wrong', 'Putting things together', 'Running machines', 'Checking quality', 'Coding', 'Working with numbers']],
  ['How You Work', ['Focus', 'Follow-through', 'Organization', 'Adaptability', 'Initiative', 'Attention to detail', 'Dependable', 'Staying calm', 'Caring', 'Curious']],
].flatMap(([category, items]) => (items as string[]).map((text) => ({ id: text.toLowerCase().replace(/\W+/g, '-'), text, category: category as string })))
