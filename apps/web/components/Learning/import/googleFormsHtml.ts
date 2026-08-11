export type GoogleFormsImportWarning = {
  code: string
  message: string
  itemId?: string
}

export type GoogleFormsImportPage = {
  title: string
  required: boolean
  content: Record<string, any>
  design: Record<string, any>
  scoring: Record<string, any>
  completion: Record<string, any>
}

export type GoogleFormsImportPreview = {
  title: string
  description: string
  pages: GoogleFormsImportPage[]
  warnings: GoogleFormsImportWarning[]
  sectionCount: number
  totalPoints: number
}

function cleanText(value: string | null | undefined) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function safeId(value: string, fallback: string) {
  const cleaned = cleanText(value).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned || fallback
}

function editableValue(root: ParentNode, selector: string) {
  const element = root.querySelector(selector) as HTMLInputElement | HTMLElement | null
  if (!element) return ''
  return cleanText('value' in element ? element.value : element.textContent)
}

function paragraphBlock(id: string, text: string, heading = false) {
  return {
    id,
    type: 'text',
    design: {},
    content: {
      node: text
        ? {
            type: heading ? 'heading' : 'paragraph',
            ...(heading ? { attrs: { level: 2 } } : {}),
            content: [{ type: 'text', text }],
          }
        : { type: 'paragraph' },
    },
  }
}

function selectedQuestionType(item: Element) {
  const selected = item.querySelector('[role="listbox"][aria-label="Question types"] [role="option"][aria-selected="true"]')
  return cleanText(selected?.getAttribute('aria-label') || selected?.textContent).toLowerCase()
}

function isRequired(item: Element) {
  return item.querySelector('[aria-label="Required"]')?.getAttribute('aria-checked') === 'true'
}

function pointValue(item: Element) {
  const match = cleanText(item.textContent).match(/\((\d+(?:\.\d+)?)\s+points?\)/i)
  return match ? Number(match[1]) : 0
}

function questionKind(questionType: string) {
  if (questionType.includes('multiple choice') || questionType.includes('checkbox') || questionType.includes('dropdown')) return 'multiple_choice'
  if (questionType.includes('paragraph') || questionType.includes('short answer')) return 'text_input'
  return ''
}

export function parseGoogleFormsEditorHtml(html: string): GoogleFormsImportPreview {
  if (typeof DOMParser === 'undefined') throw new Error('Google Forms HTML can only be parsed in the browser.')
  const document = new DOMParser().parseFromString(html, 'text/html')
  const title = cleanText(document.querySelector('meta[property="og:title"]')?.getAttribute('content'))
    || cleanText(document.title).replace(/\s*-\s*Google Forms\s*$/i, '')
    || editableValue(document, '[aria-label="Form title"]')
    || 'Imported Google Form'
  const description = cleanText(document.querySelector('meta[property="og:description"]')?.getAttribute('content'))
  const warnings: GoogleFormsImportWarning[] = []
  const pages: GoogleFormsImportPage[] = []
  let sectionCount = 0
  let totalPoints = 0
  let pendingBlocks: any[] = []

  const elements = Array.from(document.querySelectorAll('div.Io0m0c[data-item-id], div.Dyx3H[data-item-id]'))
  for (const element of elements) {
    const itemId = safeId(element.getAttribute('data-item-id') || '', `item_${pages.length + 1}`)
    if (element.matches('div.Io0m0c[data-item-id]')) {
      sectionCount += 1
      const sectionTitle = editableValue(element, '[aria-label^="Section title"]')
      const sectionDescription = editableValue(element, '[aria-label="Description (optional)"]')
      if (sectionTitle) pendingBlocks.push(paragraphBlock(`blk_google_section_${itemId}`, sectionTitle, true))
      if (sectionDescription) pendingBlocks.push(paragraphBlock(`blk_google_section_desc_${itemId}`, sectionDescription))
      continue
    }

    const questionEditor = element.querySelector('[aria-label="Question"][contenteditable="true"]')
    if (!questionEditor) {
      const image = element.querySelector('img[src*="forms-images"], img[src*="googleusercontent"]') as HTMLImageElement | null
      if (image?.src) {
        pendingBlocks.push({
          id: `blk_google_image_${itemId}`,
          type: 'image',
          design: { width: 100, align: 'center', fit: 'contain' },
          content: { src: image.src, alt: cleanText(image.alt) },
        })
      }
      continue
    }

    const questionTitle = cleanText(questionEditor.textContent) || `Question ${pages.length + 1}`
    const rawType = selectedQuestionType(element)
    const kind = questionKind(rawType)
    const points = pointValue(element)
    const required = isRequired(element)
    totalPoints += points

    if (!kind) {
      warnings.push({
        code: 'unsupported_question_type',
        itemId,
        message: `“${questionTitle}” uses ${rawType || 'an unknown question type'} and was imported as a text response.`,
      })
    }

    let questionBlock: Record<string, any>
    if (kind === 'multiple_choice') {
      const optionElements = Array.from(element.querySelectorAll('[role="listitem"][aria-label="question option"]'))
      const options = optionElements.map((optionElement, index) => {
        const input = optionElement.querySelector('input[aria-label="option value"]') as HTMLInputElement | null
        const optionId = safeId(optionElement.getAttribute('data-id') || '', String(index + 1))
        return {
          id: `opt_google_${itemId}_${optionId}`,
          text: cleanText(input?.value || input?.getAttribute('data-initial-value')) || `Option ${index + 1}`,
          correct: Boolean(optionElement.querySelector('[aria-label="Correct answer"]')),
        }
      })
      const correctOptionIds = options.filter((option) => option.correct).map((option) => option.id)
      const maxSelections = rawType.includes('checkbox') ? Math.max(1, options.length) : 1
      if (points > 0 && correctOptionIds.length === 0) {
        warnings.push({
          code: 'missing_correct_options',
          itemId,
          message: `“${questionTitle}” has points but no detectable correct answer. Mark at least one answer as correct in the editor.`,
        })
      }
      questionBlock = {
        id: `blk_google_question_${itemId}`,
        type: 'question',
        kind: 'multiple_choice',
        design: {},
        content: { label: questionTitle, options: options.map((option) => ({ id: option.id, text: option.text })) },
        scoring: {
          mode: points > 0 ? 'points' : 'off',
          points,
          score_policy: maxSelections === 1 || correctOptionIds.length > maxSelections ? 'any_correct' : 'exact_match',
          correct_option_ids: correctOptionIds,
        },
        completion: { min_selections: 1, max_selections: maxSelections },
      }
    } else {
      const multiline = rawType.includes('paragraph')
      if (points > 0) {
        warnings.push({
          code: 'unsupported_text_grading',
          itemId,
          message: `Automatic grading for “${questionTitle}” was not imported; configure accepted answers in the editor if needed.`,
        })
      }
      questionBlock = {
        id: `blk_google_question_${itemId}`,
        type: 'question',
        kind: 'text_input',
        design: {},
        content: {
          label: questionTitle,
          inputs: [{
            id: `input_google_${itemId}`,
            label: '',
            placeholder: multiline ? 'Your answer' : 'Short answer',
            input_type: 'text',
            variant: multiline ? 'short_answer' : 'single_line',
            height: multiline ? 160 : 48,
          }],
        },
        scoring: { mode: 'off', points: 0 },
        completion: {
          inputs: {
            [`input_google_${itemId}`]: { required, min_words: required ? 1 : 0 },
          },
        },
      }
    }

    pages.push({
      title: questionTitle,
      required,
      content: { version: 2, blocks: [...pendingBlocks, questionBlock] },
      design: {},
      scoring: {},
      completion: {},
    })
    pendingBlocks = []
  }

  if (!pages.length) {
    throw new Error('No Google Forms questions were found. Paste the full rendered editor HTML, including the form body.')
  }
  if (pendingBlocks.length) {
    warnings.push({ code: 'trailing_content', message: 'Content after the final question could not be attached to a page.' })
  }

  return { title, description, pages, warnings, sectionCount, totalPoints }
}
