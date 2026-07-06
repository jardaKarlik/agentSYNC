import {io, Socket} from 'socket.io-client'
import {SyncManager} from '../../sync/sync-manager.js'
import {MemoryGraphStore} from '../../../../agent/infra/memory/memory-graph-store.js'
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

      const socket = this.getSocket()

      // Push local data
      await new Promise<void>((resolve, reject) => {
        socket.emit(
          'agentsync:push',
          {
            edges: graphStore.getEdges(),
            edgeTombstones: graphStore.getEdgeTombstones(),
            nodes: graphStore.getNodes(),
            nodeTombstones: graphStore.getNodeTombstones(),
            files: filePayload.files,
            workstationId: payload.workstationId,
            agentName: payload.agentName,
          },
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
