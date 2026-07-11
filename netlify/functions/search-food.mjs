const NUTRIENT_NUMBERS = {
  calories: '208', protein: '203', carbs: '205', fiber: '291',
  fat: '204', saturated_fat: '606', trans_fat: '605', sugar: '269',
  cholesterol: '601', sodium: '307', potassium: '306',
}
const LABEL_KEYS = {
  calories: 'calories', protein: 'protein', carbs: 'carbohydrates', fiber: 'fiber',
  fat: 'fat', saturated_fat: 'saturatedFat', trans_fat: 'transFat', sugar: 'sugars',
  cholesterol: 'cholesterol', sodium: 'sodium', potassium: 'potassium',
}

const readNutrient = (food, key) => {
  const label = food.labelNutrients?.[LABEL_KEYS[key]]
  if (label?.value != null) return Number(label.value)
  const match = food.foodNutrients?.find(n => String(n.nutrientNumber) === NUTRIENT_NUMBERS[key])
  return match ? Number(match.value) || 0 : null
}

const searchUsda = async (query) => {
  const params = new URLSearchParams({ api_key: process.env.USDA_FDC_API_KEY, query, pageSize: '15', dataType: 'Branded,SR Legacy,Survey (FNDDS)' })
  const response = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?${params}`)
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    console.error(`USDA search failed: status=${response.status} body=${body.slice(0, 500)}`)
    return { ok: false, status: response.status }
  }
  const data = await response.json()
  return { ok: true, foods: data.foods || [] }
}

// USDA's search has no typo tolerance of its own, so on a zero-result search we ask
// Datamuse's free, keyless "spelled like" endpoint for a likely correction per word.
const suggestCorrection = async (word) => {
  try {
    const response = await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&max=5`)
    if (!response.ok) return null
    const suggestions = await response.json()
    const best = suggestions.find(s => s.word.toLowerCase() !== word.toLowerCase())
    return best?.word || null
  } catch { return null }
}

const mapFood = food => {
  const nutrients = {}
  for (const key of ['fat', 'saturated_fat', 'trans_fat', 'sugar', 'cholesterol', 'sodium', 'potassium']) {
    const value = readNutrient(food, key)
    if (value !== null) nutrients[key] = value
  }
  const servingSize = food.householdServingFullText || (food.servingSize ? `${food.servingSize}${food.servingSizeUnit || 'g'}` : '100g')
  const name = food.brandOwner ? `${food.description} (${food.brandOwner})` : food.description
  return {
    fdcId: food.fdcId, name, servingSize,
    calories: readNutrient(food, 'calories') || 0,
    protein: readNutrient(food, 'protein') || 0,
    fiber: readNutrient(food, 'fiber') || 0,
    carbs: readNutrient(food, 'carbs') || 0,
    nutrients,
  }
}

export default async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!process.env.USDA_FDC_API_KEY) return Response.json({ error: 'Food search is not configured.' }, { status: 503 })
  try {
    const { query } = await request.json()
    const trimmed = (query || '').trim()
    if (!trimmed) return Response.json({ error: 'Enter a food to search for.' }, { status: 400 })
    const first = await searchUsda(trimmed)
    if (!first.ok) {
      const limited = first.status === 429
      return Response.json({ error: limited ? 'The food search limit has been reached. Please try again later.' : 'The food database could not be searched.' }, { status: limited ? 429 : 502 })
    }
    let foods = first.foods
    let correctedQuery = null
    if (!foods.length) {
      const words = trimmed.split(/\s+/)
      const corrected = await Promise.all(words.map(suggestCorrection))
      if (corrected.some(Boolean)) {
        const retryQuery = words.map((word, i) => corrected[i] || word).join(' ')
        if (retryQuery.toLowerCase() !== trimmed.toLowerCase()) {
          const retry = await searchUsda(retryQuery)
          if (retry.ok && retry.foods.length) { foods = retry.foods; correctedQuery = retryQuery }
        }
      }
    }
    return Response.json({ results: foods.map(mapFood), correctedQuery })
  } catch (error) {
    console.error('search-food crashed:', error)
    return Response.json({ error: 'The food database could not be searched. Please try again.' }, { status: 500 })
  }
}
