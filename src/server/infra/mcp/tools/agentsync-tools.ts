import type {ITransportClient} from '@campfirein/brv-transport-client'
import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'

import {waitForConnectedClient} from '@campfirein/brv-transport-client'
import {z} from 'zod'

export const AddMemoryInputSchema = z.object({
  content: z.string().describe('Detailed content of the memory/fact'),
  relations: z
    .array(
      z.object({
        relationType: z.enum(['DEPENDS_ON', 'DEPRECATED_BY', 'RELATED_TO', 'INCLUDES']),
        targetId: z.string().describe('Target URN to link to'),
      }),
    )
    .optional()
    .describe('Relations to create from this node'),
  sourceWorkstation: z.string().optional().describe('Source workstation name (e.g. STUDIO)'),
  title: z.string().describe('Short descriptive title'),
  type: z.enum(['project', 'task', 'rule', 'fact', 'profile']).describe('Type of memory entity'),
})

interface AddMemoryArgs {
  content: string
  relations?: Array<{
    relationType: 'DEPENDS_ON' | 'DEPRECATED_BY' | 'INCLUDES' | 'RELATED_TO'
    targetId: string
  }>
  sourceWorkstation?: string
  title: string
  type: 'fact' | 'profile' | 'project' | 'rule' | 'task'
}

interface StatusResponse {
  tier: string
  workstations: Array<{
    aligned: boolean
    name: string
  }>
}

interface TriggerSyncResponse {
  message: string
}

interface AddMemoryResponse {
  nodeId: string
}

export function registerAgentSyncTools(server: McpServer, getClient: () => ITransportClient | undefined): void {
  // 1. agentsync_status
  server.registerTool(
    'agentsync_status',
    {
      description: 'Get status of AgentSync workstation synchronization and plan limitations.',
      inputSchema: z.object({}),
      title: 'AgentSync Status',
    },
    async () => {
      const client = await waitForConnectedClient(getClient)
      if (!client) {
        return {
          content: [{text: 'Error: Daemon connection timed out.', type: 'text' as const}],
          isError: true,
        }
      }

      try {
        const response = await client.requestWithAck<StatusResponse>('agentsync:status', {})
        return {
          content: [{text: JSON.stringify(response, null, 2), type: 'text' as const}],
          isError: false,
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          content: [{text: `Error getting status: ${message}`, type: 'text' as const}],
          isError: true,
        }
      }
    },
  )

  // 2. agentsync_trigger_sync
  server.registerTool(
    'agentsync_trigger_sync',
    {
      description: 'Force an immediate push/pull synchronization of memories and configurations.',
      inputSchema: z.object({}),
      title: 'AgentSync Trigger Sync',
    },
    async () => {
      const client = await waitForConnectedClient(getClient)
      if (!client) {
        return {
          content: [{text: 'Error: Daemon connection timed out.', type: 'text' as const}],
          isError: true,
        }
      }

      try {
        const response = await client.requestWithAck<TriggerSyncResponse>('agentsync:trigger_sync', {})
        return {
          content: [{text: response.message || 'Sync triggered successfully.', type: 'text' as const}],
          isError: false,
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          content: [{text: `Sync trigger failed: ${message}`, type: 'text' as const}],
          isError: true,
        }
      }
    },
  )

  // 3. agentsync_add_memory
  server.registerTool(
    'agentsync_add_memory',
    {
      description: 'Add a new structured memory entity to the graph with optional relational links.',
      inputSchema: AddMemoryInputSchema,
      title: 'AgentSync Add Memory',
    },
    async (args: unknown) => {
      const client = await waitForConnectedClient(getClient)
      if (!client) {
        return {
          content: [{text: 'Error: Daemon connection timed out.', type: 'text' as const}],
          isError: true,
        }
      }

      try {
        const parsedArgs = AddMemoryInputSchema.parse(args) as AddMemoryArgs
        const response = await client.requestWithAck<AddMemoryResponse>('agentsync:add_memory', parsedArgs)
        return {
          content: [{text: `Memory added successfully. Node ID: ${response.nodeId}`, type: 'text' as const}],
          isError: false,
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          content: [{text: `Failed to add memory: ${message}`, type: 'text' as const}],
          isError: true,
        }
      }
    },
  )
}
