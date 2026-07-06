import type {GraphEdge, GraphNode} from '../../agent/infra/memory/memory-graph-store.js'

export interface SyncGraphPayload {
  edges: GraphEdge[]
  edgeTombstones: Array<[string, number]>
  nodes: GraphNode[]
  nodeTombstones: Array<[string, number]>
}

export class AgentSyncBackend {
  private readonly inMemory: boolean
  private readonly userEdges = new Map<string, Map<string, GraphEdge>>()
  private readonly userEdgeTombstones = new Map<string, Map<string, number>>()
  // In-memory data store for testing: UserID -> Maps
  private readonly userNodes = new Map<string, Map<string, GraphNode>>()
  private readonly userNodeTombstones = new Map<string, Map<string, number>>()

  constructor(options?: {inMemory?: boolean}) {
    this.inMemory = options?.inMemory ?? false
  }

  /**
   * Retrieves the merged graph payload for a specific user.
   */
  public async handlePull(userId: string): Promise<SyncGraphPayload> {
    if (this.inMemory) {
      return this.pullFromMemory(userId)
    }

    return {edges: [], edgeTombstones: [], nodes: [], nodeTombstones: []}
  }

  /**
   * Processes a client push payload for a specific user, merging graph elements.
   */
  public async handlePush(userId: string, payload: SyncGraphPayload): Promise<void> {
    if (this.inMemory) {
      this.mergeInMemory(userId, payload)
    }
    // Database sync logic will go here when connected to PostgreSQL
  }

  private mergeInMemory(userId: string, payload: SyncGraphPayload): void {
    if (!this.userNodes.has(userId)) {
      this.userNodes.set(userId, new Map())
      this.userEdges.set(userId, new Map())
      this.userNodeTombstones.set(userId, new Map())
      this.userEdgeTombstones.set(userId, new Map())
    }

    const nodes = this.userNodes.get(userId)!
    const edges = this.userEdges.get(userId)!
    const nodeTombstones = this.userNodeTombstones.get(userId)!
    const edgeTombstones = this.userEdgeTombstones.get(userId)!

    // 1. Merge node tombstones
    for (const [id, ts] of payload.nodeTombstones) {
      const local = nodeTombstones.get(id)
      if (local === undefined || ts > local) {
        nodeTombstones.set(id, ts)
        nodes.delete(id)
      }
    }

    // 2. Merge edge tombstones
    for (const [id, ts] of payload.edgeTombstones) {
      const local = edgeTombstones.get(id)
      if (local === undefined || ts > local) {
        edgeTombstones.set(id, ts)
        edges.delete(id)
      }
    }

    // 3. Merge nodes (LWW)
    for (const node of payload.nodes) {
      const tombstoneTs = nodeTombstones.get(node.id)
      if (tombstoneTs !== undefined && tombstoneTs >= node.timestamp) {
        continue
      }

      const existing = nodes.get(node.id)
      if (existing === undefined || node.timestamp > existing.timestamp) {
        nodes.set(node.id, node)
        if (tombstoneTs !== undefined && node.timestamp > tombstoneTs) {
          nodeTombstones.delete(node.id)
        }
      }
    }

    // 4. Merge edges (LWW)
    for (const edge of payload.edges) {
      const tombstoneTs = edgeTombstones.get(edge.id)
      if (tombstoneTs !== undefined && tombstoneTs >= edge.timestamp) {
        continue
      }

      const existing = edges.get(edge.id)
      if (existing === undefined || edge.timestamp > existing.timestamp) {
        edges.set(edge.id, edge)
        if (tombstoneTs !== undefined && edge.timestamp > tombstoneTs) {
          edgeTombstones.delete(edge.id)
        }
      }
    }

    // 5. Clean up any invalid edges
    for (const [nodeId, timestamp] of nodeTombstones.entries()) {
      for (const [edgeId, edge] of edges.entries()) {
        if (edge.sourceId === nodeId || edge.targetId === nodeId) {
          edgeTombstones.set(edgeId, timestamp)
          edges.delete(edgeId)
        }
      }
    }
  }

  private pullFromMemory(userId: string): SyncGraphPayload {
    const nodes = this.userNodes.get(userId)
    const edges = this.userEdges.get(userId)
    const nodeTombstones = this.userNodeTombstones.get(userId)
    const edgeTombstones = this.userEdgeTombstones.get(userId)

    return {
      edges: edges ? [...edges.values()] : [],
      edgeTombstones: edgeTombstones ? [...edgeTombstones.entries()] : [],
      nodes: nodes ? [...nodes.values()] : [],
      nodeTombstones: nodeTombstones ? [...nodeTombstones.entries()] : [],
    }
  }
}
