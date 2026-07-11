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
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: 'Label scanning is not configured.' }, { status: 503 })
  try {
    const { image } = await request.json()
    if (!image?.startsWith('data:image/')) return Response.json({ error: 'A valid image is required.' }, { status: 400 })
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        input: [{ role: 'user', content: [
          { type: 'input_text', text: 'Determine whether this is a readable packaged-food Nutrition Facts label. Reject ordinary photos, menus, ingredients-only panels, and unreadable labels. If valid, extract the product name when visible, exact serving size, and every nutrient with its printed numeric value and unit. Do not infer missing values.' },
          { type: 'input_image', image_url: image, detail: 'high' },
        ] }],
        text: { format: { type: 'json_schema', name: 'nutrition_label', strict: true, schema } },
      }),
    })
    if (!response.ok) return Response.json({ error: 'The label scanner could not process this image.' }, { status: 502 })
    const result = await response.json()
    const text = result.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text
    if (!text) return Response.json({ error: 'No label details were returned.' }, { status: 502 })
    return Response.json(JSON.parse(text))
  } catch {
    return Response.json({ error: 'The image could not be scanned. Please try again.' }, { status: 500 })
  }
}
