function cosineSimilarity(a: Record<string, number>, b: Record<string, number>) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})])
  if (keys.size === 0) return 0

  let dot = 0
  let magA = 0
  let magB = 0

  keys.forEach(key => {
    const left = Number(a?.[key] ?? 0)
    const right = Number(b?.[key] ?? 0)
    dot += left * right
    magA += left ** 2
    magB += right ** 2
  })

  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

function getSortScoreKey(cardUuid: string, categoryUuid: string) {
  return `${cardUuid}::${categoryUuid}`
}

export function computeQuizScoresPreview(
  answers: { question_uuid: string; answer_json: any }[],
  optionScores: Record<string, Record<string, number>>,
  textScores: Record<string, any>,
  vectors: any[]
) {
  if (!vectors?.length) return {}

  const vectorKeys = vectors.map(vector => vector.key)
  const totals = Object.fromEntries(vectorKeys.map(key => [key, 0])) as Record<string, number>
  const counts = Object.fromEntries(vectorKeys.map(key => [key, 0])) as Record<string, number>

  answers.forEach(answer => {
    const answerJson = answer.answer_json || answer
    const answerType = answerJson.type

    if (answerType === 'select') {
      const optionUuid = answerJson.option_uuid
      if (!optionUuid) return
      const scoreMap = optionScores?.[optionUuid] || {}
      vectorKeys.forEach(key => {
        totals[key] += Number(scoreMap[key] ?? 0)
        counts[key] += 1
      })
      return
    }

    if (answerType === 'text') {
      const rule = textScores?.[answer.question_uuid] || {}
      if (rule.mode !== 'min_length') return
      const minChars = Math.max(0, Number(rule.min_chars || 0))
      const text = String(answerJson.text || '').trim()
      vectorKeys.forEach(key => {
        if (key !== 'correct') return
        totals[key] += text.length >= minChars ? 1 : 0
        counts[key] += 1
      })
      return
    }

    if (answerType === 'slider') {
      const values = answerJson.values || {}
      Object.entries(values).forEach(([optionUuid, multiplier]) => {
        const normalizedMultiplier = Math.max(0, Math.min(1, Number(multiplier) || 0))
        const scoreMap = optionScores?.[optionUuid] || {}
        vectorKeys.forEach(key => {
          totals[key] += Number(scoreMap[key] ?? 0) * normalizedMultiplier
          counts[key] += 1
        })
      })
      return
    }

    if (answerType === 'sort') {
      const assignments = answerJson.assignments || {}
      Object.entries(assignments).forEach(([cardUuid, categoryUuid]) => {
        const scoreMap = optionScores?.[getSortScoreKey(cardUuid, String(categoryUuid))] || {}
        vectorKeys.forEach(key => {
          totals[key] += Number(scoreMap[key] ?? 0)
          counts[key] += 1
        })
      })
    }
  })

  return Object.fromEntries(
    vectorKeys.map(key => [key, counts[key] ? totals[key] / counts[key] : 0])
  )
}

export function matchQuizResultPreview(
  scores: Record<string, number>,
  resultOptions: any[]
) {
  if (!resultOptions?.length) return null

  let bestMatch = null
  let bestSimilarity = -2

  resultOptions.forEach(option => {
    const similarity = cosineSimilarity(scores, option?.scores || {})
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity
      bestMatch = { ...option, similarity: Number(similarity.toFixed(4)) }
    }
  })

  return bestMatch
}
