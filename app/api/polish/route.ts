import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: NextRequest) {
  let body: { text?: string }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // Fallback: return as-is when no API key configured
    return NextResponse.json({ polished: text })
  }

  try {
    const client = new Anthropic({ apiKey })

    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 64,
      messages: [
        {
          role: 'user',
          content: `Rewrite this rough goal into a clean, concise action item. Keep it short (under 10 words). Return only the rewritten text, no explanation.\n\nGoal: ${text}`,
        },
      ],
    })

    const content = message.content[0]
    const polished =
      content.type === 'text' ? content.text.trim() : text

    return NextResponse.json({ polished })
  } catch (err) {
    console.error('Polish API error:', err)
    // Graceful fallback
    return NextResponse.json({ polished: text })
  }
}
