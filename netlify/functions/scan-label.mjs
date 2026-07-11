const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    is_nutrition_label: { type: 'boolean' },
    rejection_reason: { type: 'string' },
    product_name: { type: 'string' },
    serving_size: { type: 'string' },
    nutrients: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: { name: { type: 'string' }, value: { type: 'number' }, unit: { type: 'string' } },
        required: ['name', 'value', 'unit'],
      },
    },
  },
  required: ['is_nutrition_label', 'rejection_reason', 'product_name', 'serving_size', 'nutrients'],
}

export default async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!process.env.GEMINI_API_KEY) return Response.json({ error: 'Label scanning is not configured.' }, { status: 503 })
  try {
    const { image } = await request.json()
    if (!image?.startsWith('data:image/')) return Response.json({ error: 'A valid image is required.' }, { status: 400 })
    const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s)
    if (!match) return Response.json({ error: 'The image format is not supported.' }, { status: 400 })
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent', {
      method: 'POST',
      headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { inlineData: { mimeType: match[1], data: match[2] } },
          { text: 'Determine whether this is a readable packaged-food Nutrition Facts label. Reject ordinary photos, menus, ingredients-only panels, and unreadable labels. If valid, extract the product name when visible, exact serving size, and every nutrient with its printed numeric value and unit. Do not infer missing values.' },
        ] }],
        generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0.1 },
      }),
    })
    if (!response.ok) {
      const details = await response.json().catch(() => null)
      const limited = response.status === 429
      return Response.json({ error: limited ? 'The free scanner limit has been reached. Please try again later.' : details?.error?.message || 'The label scanner could not process this image.' }, { status: limited ? 429 : 502 })
    }
    const result = await response.json()
    const text = result.candidates?.[0]?.content?.parts?.find(part => part.text)?.text
    if (!text) return Response.json({ error: 'No label details were returned.' }, { status: 502 })
    return Response.json(JSON.parse(text))
  } catch {
    return Response.json({ error: 'The image could not be scanned. Please try again.' }, { status: 500 })
  }
}
