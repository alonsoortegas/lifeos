import { NextRequest } from 'next/server'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createMcpServer } from '@/lib/mcp/server'

function verifyAuth(req: NextRequest): boolean {
  const key = process.env.MCP_API_KEY
  if (!key) return false
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${key}`
}

async function handle(req: NextRequest): Promise<Response> {
  if (!verifyAuth(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const server = createMcpServer()
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — new instance per request
  })

  await server.connect(transport)
  return transport.handleRequest(req)
}

export const GET = handle
export const POST = handle
export const DELETE = handle
