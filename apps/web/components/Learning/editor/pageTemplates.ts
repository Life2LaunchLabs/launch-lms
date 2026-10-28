import { createBlockId, createInputId, createOptionId } from './utils'

// Starting points for a new page: a blank page or video, and pages that
// already work. Each makes fresh ids every time it is used.

export type PageDraft = { page_type: 'standard' | 'video'; title: string; content: any; design: any }
export type PageTemplate = { id: string; category: 'Start' | 'Teach' | 'Check' | 'Reflect'; name: string; description: string; make: () => PageDraft }

const heading = (text: string, size: 'm' | 'l' | 'xl' = 'l') => ({ id: createBlockId(), type: 'heading', content: { text, size } })
const text = (value: string) => ({ id: createBlockId(), type: 'text', design: { width: 100, align: 'left' }, content: { nodes: [{ type: 'paragraph', content: value ? [{ type: 'text', text: value }] : [] }] } })
const image = () => ({ id: createBlockId(), type: 'image', design: { width: 100, align: 'center', height: 240, fit: 'cover' }, content: { src: '', alt: '' } })
const columnBreak = () => ({ id: createBlockId(), type: 'column_break' })

function choice(options: string[], { scored, multi = false, style = 'list' }: { scored: boolean; multi?: boolean; style?: string }) {
  const items = options.map((label) => ({ id: createOptionId(), text: label }))
  return {
    id: createBlockId(),
    type: 'question',
    kind: 'multiple_choice',
    design: { width: 100, align: 'left', style },
    content: { options: items },
    scoring: scored ? { mode: 'points', points: 1, score_policy: 'select_all', correct_option_ids: [items[0].id] } : { mode: 'off', points: 0, correct_option_ids: [] },
    completion: { min_selections: 1, max_selections: multi ? items.length : 1, question_mode: scored ? 'scored' : 'variable' },
  }
}

function written(label: string, placeholder: string) {
  const id = createInputId()
  return {
    id: createBlockId(),
    type: 'question',
    kind: 'text_input',
    design: { width: 100, align: 'left' },
    content: { inputs: [{ id, section_id: id, label, placeholder, variant: 'long_answer', input_type: 'text', width: 'full', height: 160 }] },
    scoring: { mode: 'completion', points: 1 },
    completion: { inputs: { [id]: { required: true, min_words: 1, max_words: 0, points: 1 } } },
  }
}

const standard = (title: string, blocks: any[], design: any = {}): PageDraft => ({ page_type: 'standard', title, content: { version: 3, blocks }, design })

export function blankPage(): PageDraft {
  return standard('New page', [heading('')])
}

export function blankVideo(): PageDraft {
  return { page_type: 'video', title: 'New video', content: { video_url: '', heading: '', allow_scrubbing: true }, design: {} }
}

export const PAGE_TEMPLATES: PageTemplate[] = [
  { id: 'video', category: 'Start', name: 'Video short', description: 'Full-screen video.', make: () => ({ ...blankVideo(), title: 'Video' }) },
  {
    id: 'title_photo', category: 'Start', name: 'Photo behind a title', description: 'A big photo with a heading over it.',
    make: () => standard('A heading that sets the scene', [heading('A heading that sets the scene', 'xl'), text('One line on why it matters.')], { valign: 'bottom', background: { color: '#0f172a', gradient_to: '#1e3a8a' } }),
  },
  {
    id: 'image_text', category: 'Teach', name: 'Image and text', description: 'Two columns on wide screens.',
    make: () => standard('One idea, clearly', [image(), columnBreak(), heading('One idea, clearly'), text('Two or three sentences. Keep it to what the learner needs right now.')], { columns: 2 }),
  },
  {
    id: 'card_deck', category: 'Teach', name: 'Card deck', description: 'A list, one card at a time.',
    make: () => standard('Things to know', [heading('Things to know'), { id: createBlockId(), type: 'card_deck', content: { cards: [{ id: createOptionId(), title: 'First thing', body: 'One sentence about it.' }, { id: createOptionId(), title: 'Second thing', body: 'One sentence about it.' }] } }]),
  },
  {
    id: 'big_number', category: 'Teach', name: 'Big number', description: 'A fact that lands.',
    make: () => standard('A number worth knowing', [{ id: createBlockId(), type: 'number', content: { value: 72, suffix: '%', label: 'of something worth knowing' } }, heading('A number worth knowing', 'm'), text('Where the number comes from.')], { background: { color: '#1e3a8a' } }),
  },
  {
    id: 'quick_check', category: 'Check', name: 'Quick check', description: 'One question with one best answer.',
    make: () => standard('A question with one best answer?', [heading('A question with one best answer?'), choice(['The right answer', 'A tempting wrong one', 'Another wrong one'], { scored: true })]),
  },
  {
    id: 'scenario', category: 'Check', name: 'Scenario', description: 'A picture, a situation, a choice.',
    make: () => standard("Here's the situation. What do you do?", [image(), columnBreak(), heading("Here's the situation. What do you do?"), choice(['Best move', 'Okay move', 'Risky move'], { scored: true })], { columns: 2 }),
  },
  {
    id: 'pick_few', category: 'Reflect', name: 'Pick a few', description: 'Choose any that fit.',
    make: () => standard('Which of these sound like you?', [heading('Which of these sound like you?'), choice(['Curious', 'Patient', 'Organized', 'Creative', 'Calm'], { scored: false, multi: true, style: 'pills' })]),
  },
  {
    id: 'short_answer', category: 'Reflect', name: 'Short answer', description: 'A prompt and a written answer.',
    make: () => standard('What would you tell a friend starting tomorrow?', [heading('What would you tell a friend starting tomorrow?'), written('Your answer', 'Start typing')]),
  },
  {
    id: 'show_work', category: 'Reflect', name: 'Show your work', description: 'An upload for staff to review.',
    make: () => standard('Show us what you made', [heading('Show us what you made'), { id: createBlockId(), type: 'question', kind: 'image_upload', design: { width: 100, align: 'left' }, content: { label: 'A photo of your work' }, scoring: { mode: 'manual', points: 1 }, completion: { required: true } }]),
  },
]
