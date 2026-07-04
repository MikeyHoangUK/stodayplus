import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

type Message = {
  role: string
  content: string | ContentPart[]
}

// Convert OpenAI messages → Gemini native format
function toGeminiRequest(messages: Message[], temperature?: number, max_tokens?: number) {
  const systemParts: string[] = []
  const contents: unknown[] = []

  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(typeof m.content === 'string' ? m.content : '')
      continue
    }
    const role = m.role === 'assistant' ? 'model' : 'user'
    const parts: unknown[] = typeof m.content === 'string'
      ? [{ text: m.content }]
      : (m.content as ContentPart[]).map(c => {
          if (c.type === 'text') return { text: c.text }
          if (c.type === 'image_url') {
            const url = c.image_url.url
            if (url.startsWith('data:')) {
              const [header, data] = url.split(',')
              const mimeType = header.split(':')[1].split(';')[0]
              return { inlineData: { mimeType, data } }
            }
            return { fileData: { fileUri: url } }
          }
          return { text: '' }
        })
    contents.push({ role, parts })
  }

  const req: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: temperature ?? 0.7,
      maxOutputTokens: max_tokens ?? 2048,
    },
  }
  if (systemParts.length > 0) {
    req.systemInstruction = { parts: [{ text: systemParts.join('\n') }] }
  }
  return req
}

// Convert Gemini response → OpenAI format
function toOpenAIResponse(data: Record<string, unknown>) {
  const candidates = data?.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined
  const text = candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  return {
    choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop', index: 0 }],
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: cors })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: { message: 'Sign in to use AI features.' } }),
      { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  })
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return new Response(
      JSON.stringify({ error: { message: 'Sign in to use AI features.' } }),
      { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }

  if (!GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: { message: 'GEMINI_API_KEY secret is not set.' } }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const payload = await req.json()
    const geminiBody = toGeminiRequest(payload.messages, payload.temperature, payload.max_tokens)

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      }
    )

    const rawText = await resp.text()
    let data: Record<string, unknown>
    try { data = JSON.parse(rawText) } catch { data = { error: { message: rawText } } }

    if (!resp.ok) {
      const errMsg = (data?.error as { message?: string })?.message
        || `Gemini error ${resp.status}: ${rawText.slice(0, 300)}`
      return new Response(
        JSON.stringify({ error: { message: errMsg } }),
        { status: resp.status, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(JSON.stringify(toOpenAIResponse(data)), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    return new Response(
      JSON.stringify({ error: { message: msg } }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
