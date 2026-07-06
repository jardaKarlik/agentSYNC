import {io, Socket} from 'socket.io-client'
import * as fs from 'node:fs/promises'
import {join} from 'node:path'
import {SyncManager} from '../../sync/sync-manager.js'
import {MemoryGraphStore} from '../../../../agent/infra/memory/memory-graph-store.js'
import {processLog} from '../../../utils/process-logger.js'
import {ProjectPathResolver, resolveRequiredProjectPath} from './handler-types.js'

export interface AgentSyncHandlerDeps {
  transport: {
    onRequest(event: string, handler: (payload: any, clientId: string) => Promise<any>): void
  }
  billingService: {
    isPaidUser(sessionKey: string): Promise<boolean>
  }
  resolveProjectPath: ProjectPathResolver
}

export class AgentSyncHandler {
  private readonly transport: AgentSyncHandlerDeps['transport']
  private readonly billingService: AgentSyncHandlerDeps['billingService']
  private readonly resolveProjectPath: AgentSyncHandlerDeps['resolveProjectPath']
  private socket: Socket | null = null
  private readonly backendUrl = process.env.AGENTSYNC_BACKEND_URL || 'https://agentsync-backend-production.up.railway.app'

  constructor(deps: AgentSyncHandlerDeps) {
    this.transport = deps.transport
    this.billingService = deps.billingService
    this.resolveProjectPath = deps.resolveProjectPath
  }

  /**
   * Auto-seed memory graph from instruction files (agent.md, soul.md)
   * if the graph is empty. This ensures file content is available in the graph.
   */
  private async seedMemoryGraphFromFiles(
    projectPath: string,
    syncManager: SyncManager,
    graphStore: MemoryGraphStore,
    workstationId: string,
  ): Promise<void> {
    processLog(`[AgentSync] Seeding check: graph currently has ${graphStore.getNodes().length} nodes`)
    // Only seed if graph is currently empty
    if (graphStore.getNodes().length > 0) {
      return
    }

    const filesToSeed = ['agent.md', 'soul.md']

    for (const filename of filesToSeed) {
      try {
        processLog(`[AgentSync] Parsing instruction file: ${filename}`)
        const parsed = await syncManager.parseInstructionFile(filename)
        processLog(`[AgentSync] Parsed ${filename}: sharedRulesLength=${parsed.sharedRules.length}, identityLength=${parsed.identity.length}`)

        // Create a node for shared rules section
        if (parsed.sharedRules && parsed.sharedRules.trim().length > 0) {
          graphStore.createNode({
            type: 'rule',
            title: `${filename}: Shared Guidelines`,
            content: parsed.sharedRules,
            sourceWorkstation: workstationId,
          })
          processLog(`[AgentSync] Created node for ${filename} shared rules`)
        }

        // Create a node for workstation identity section
        if (parsed.identity && parsed.identity.trim().length > 0) {
          graphStore.createNode({
            type: 'profile',
            title: `${filename}: Workstation Identity`,
            content: parsed.identity,
            sourceWorkstation: workstationId,
          })
          processLog(`[AgentSync] Created node for ${filename} workstation identity`)
        }
      } catch (error) {
        // Skip file if it doesn't exist or can't be parsed
        processLog(`[AgentSync] Warning: Could not seed from ${filename}: ${error instanceof Error ? error.stack : String(error)}`)
      }
    }

    // Save the seeded graph
    if (graphStore.getNodes().length > 0) {
      await graphStore.save(projectPath)
      processLog(`[AgentSync] Seeded memory graph with ${graphStore.getNodes().length} nodes`)
    } else {
      processLog(`[AgentSync] No nodes generated during seeding`)
    }
  }

  public setup(): void {
    // 1. agentsync:status
    this.transport.onRequest('agentsync:status', async (payload: any, clientId: string) => {
      const socket = this.getSocket()
      return new Promise((resolve, reject) => {
        socket.emit('agentsync:status', payload, (res: any) => {
          if (res && res.error) {
            reject(new Error(res.error))
          } else {
            resolve(res)
          }
        })
      })
    })

    // 2. agentsync:trigger_sync
    this.transport.onRequest('agentsync:trigger_sync', async (payload: any, clientId: string) => {
      const projectPath = resolveRequiredProjectPath(this.resolveProjectPath, clientId)
      const sessionKey = payload.sessionKey || 'default-session-key'
      const syncManager = new SyncManager({
        billingService: this.billingService,
        projectPath,
        sessionKey,
      })

      // Prepare sync payload (runs limits checks on file line length)
      const filePayload = await syncManager.prepareSyncPayload()

      // Read local memory graph
      const graphStore = new MemoryGraphStore()
      await graphStore.load(projectPath)

      // Auto-seed graph from instruction files if empty
      await this.seedMemoryGraphFromFiles(projectPath, syncManager, graphStore, payload.workstationId)

      const socket = this.getSocket()

      // Build push payload
      const pushPayload = {
        edges: graphStore.getEdges(),
        edgeTombstones: graphStore.getEdgeTombstones(),
        nodes: graphStore.getNodes(),
        nodeTombstones: graphStore.getNodeTombstones(),
        files: filePayload.files,
        workstationId: payload.workstationId,
        agentName: payload.agentName,
      }

      // Log payload for debugging
      processLog(`[AgentSync] Sending push payload: nodeCount=${pushPayload.nodes.length}, edgeCount=${pushPayload.edges.length}, filesIncluded=${Object.keys(pushPayload.files).join(',')}, workstationId=${pushPayload.workstationId}, agentName=${pushPayload.agentName}`)

      // Push local data
      await new Promise<void>((resolve, reject) => {
        socket.emit(
          'agentsync:push',
          pushPayload,
          (res: any) => {
            if (res && res.error) {
              reject(new Error(res.error))
            } else {
              resolve()
            }
          },
        )
      })

      // Pull remote data
      const remotePayload = await new Promise<any>((resolve, reject) => {
        socket.emit('agentsync:pull', {
          workstationId: payload.workstationId,
          agentName: payload.agentName,
        }, (res: any) => {
          if (res && res.error) {
            reject(new Error(res.error))
          } else {
            resolve(res)
          }
        })
      })

      // Merge remote data into graph store and save
      graphStore.merge(remotePayload)
      await graphStore.save(projectPath)

      // Write pulled files back to project workspace
      if (remotePayload.files) {
        for (const [filename, fileData] of Object.entries(remotePayload.files)) {
          if (fileData && typeof fileData === 'object' && 'rawContent' in fileData) {
            const rawContent = (fileData as any).rawContent
            if (rawContent && rawContent.trim().length > 0) {
              const filePath = join(projectPath, filename)
              await fs.writeFile(filePath, rawContent, 'utf8')
              processLog(`[AgentSync] Wrote pulled instruction file: ${filename} to ${filePath}`)
            }
          }
        }
      }

      return {message: 'Sync completed successfully'}
    })

    // 3. agentsync:add_memory
    this.transport.onRequest('agentsync:add_memory', async (payload: any, clientId: string) => {
      const projectPath = resolveRequiredProjectPath(this.resolveProjectPath, clientId)
      const graphStore = new MemoryGraphStore()
      await graphStore.load(projectPath)

      const nodeId = graphStore.createNode({
        content: payload.content,
        sourceWorkstation: payload.workstationId || payload.sourceWorkstation || process.env.COMPUTERNAME || 'STUDIO',
        title: payload.title,
        type: payload.type,
      })

      if (payload.relations && Array.isArray(payload.relations)) {
        for (const rel of payload.relations) {
          graphStore.createEdge({
            relationType: rel.relationType,
            sourceId: nodeId,
            targetId: rel.targetId,
          })
        }
      }

      await graphStore.save(projectPath)

      return {nodeId}
    })
  }

  private getSocket(): Socket {
    if (!this.socket) {
      this.socket = io(this.backendUrl, {
        autoConnect: true,
        reconnection: true,
      })
    }
    return this.socket
  }
}
