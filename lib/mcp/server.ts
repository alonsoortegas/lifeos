import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerResources } from './resources'
import { registerTools } from './tools'
import { registerPrompts } from './prompts'

export function createMcpServer() {
  const server = new McpServer({
    name: 'LifeOS',
    version: '1.0.0',
  })

  registerResources(server)
  registerTools(server)
  registerPrompts(server)

  return server
}
