import {randomUUID} from 'node:crypto'
import * as fs from 'node:fs/promises'
import {join} from 'node:path'

export interface GraphNode {
  confidence?: number
  content: string
  hash: string
  id: string
  sourceWorkstation: string
  timestamp: number
  title: string
  type: string
}

export interface GraphEdge {
  id: string
  relationType: string
  sourceId: string
  targetId: string
  timestamp: number
}

/**
 * MemoryGraphStore implements a CRDT-based local memory graph.
 * Uses LWW (Last-Write-Wins) and Delete-Wins Tombstones.
 */
export class MemoryGraphStore {
  public readonly edges = new Map<string, GraphEdge>()
  public readonly edgeTombstones = new Map<string, number>()
  public readonly nodes = new Map<string, GraphNode>()
  public readonly nodeTombstones = new Map<string, number>()

  /**
   * Load graph store from file.
   */
  public async load(projectPath: string): Promise<void> {
    const filePath = join(projectPath, '.brv', 'agentsync-graph.json')
    try {
      const content = await fs.readFile(filePath, 'utf8')
      this.fromJSON(content)
    } catch {
      // Start empty if file does not exist
      this.nodes.clear()
      this.edges.clear()
      this.nodeTombstones.clear()
      this.edgeTombstones.clear()
    }
  }

  /**
   * Save graph store to file.
   */
  public async save(projectPath: string): Promise<void> {
    const brvDir = join(projectPath, '.brv')
    await fs.mkdir(brvDir, {recursive: true})
    const filePath = join(brvDir, 'agentsync-graph.json')
    await fs.writeFile(filePath, this.toJSON(), 'utf8')
  }

  /**
   * Create and add a new node, generating id, timestamp, and hash.
   */
  public createNode(node: Omit<GraphNode, 'id' | 'timestamp' | 'hash'>): string {
    const id = `urn:agentsync:node:${randomUUID()}`
    const timestamp = Date.now()
    const hash = `${node.title}:${node.type}`
    this.addNode({
      ...node,
      hash,
      id,
      timestamp,
    })
    return id
  }

  /**
   * Create and add a new edge, generating id and timestamp.
   */
  public createEdge(edge: Omit<GraphEdge, 'id' | 'timestamp'>): string {
    const id = `urn:agentsync:edge:${randomUUID()}`
    const timestamp = Date.now()
    this.addEdge({
      ...edge,
      id,
      timestamp,
    })
    return id
  }

  public getNodes(): GraphNode[] {
    return [...this.nodes.values()]
  }

  public getEdges(): GraphEdge[] {
    return [...this.edges.values()]
  }

  public getNodeTombstones(): Array<[string, number]> {
    return [...this.nodeTombstones.entries()]
  }

  public getEdgeTombstones(): Array<[string, number]> {
    return [...this.edgeTombstones.entries()]
  }

  /**
   * Add an edge to the graph. Enforces LWW and Delete-Wins constraints.
   */
  public addEdge(edge: GraphEdge): void {
    const tombstoneTs = this.edgeTombstones.get(edge.id)
    if (tombstoneTs !== undefined && tombstoneTs >= edge.timestamp) {
      return
    }

    const existing = this.edges.get(edge.id)
    if (existing !== undefined && existing.timestamp >= edge.timestamp) {
      return
    }

    this.edges.set(edge.id, edge)

    if (tombstoneTs !== undefined && edge.timestamp > tombstoneTs) {
      this.edgeTombstones.delete(edge.id)
    }
  }

  /**
   * Add a node to the graph. Enforces LWW and Delete-Wins constraints.
   */
  public addNode(node: GraphNode): void {
    const tombstoneTs = this.nodeTombstones.get(node.id)
    if (tombstoneTs !== undefined && tombstoneTs >= node.timestamp) {
      // Node remains deleted
      return
    }

    const existing = this.nodes.get(node.id)
    if (existing !== undefined && existing.timestamp >= node.timestamp) {
      // Existing node is newer or equal
      return
    }

    // Add or overwrite node
    this.nodes.set(node.id, node)

    // Supersede any older tombstone
    if (tombstoneTs !== undefined && node.timestamp > tombstoneTs) {
      this.nodeTombstones.delete(node.id)
    }
  }

  /**
   * Delete an edge from the graph at a given timestamp.
   */
  public deleteEdge(id: string, timestamp: number): void {
    const existingTombstone = this.edgeTombstones.get(id)
    if (existingTombstone !== undefined && existingTombstone >= timestamp) {
      return
    }

    this.edgeTombstones.set(id, timestamp)
    this.edges.delete(id)
  }

  /**
   * Delete a node from the graph at a given timestamp.
   */
  public deleteNode(id: string, timestamp: number): void {
    const existingTombstone = this.nodeTombstones.get(id)
    if (existingTombstone !== undefined && existingTombstone >= timestamp) {
      return
    }

    // Record tombstone
    this.nodeTombstones.set(id, timestamp)
    this.nodes.delete(id)

    // Clean up incident edges at the same timestamp
    const incident = this.getIncidentEdges(id)
    for (const edge of incident) {
      this.deleteEdge(edge.id, timestamp)
    }
  }

  /**
   * Load graph store from JSON.
   */
  public fromJSON(jsonStr: string): void {
    const data = JSON.parse(jsonStr)
    this.nodes.clear()
    this.edges.clear()
    this.nodeTombstones.clear()
    this.edgeTombstones.clear()

    if (data.nodes) {
      for (const node of data.nodes) {
        this.nodes.set(node.id, node)
      }
    }

    if (data.edges) {
      for (const edge of data.edges) {
        this.edges.set(edge.id, edge)
      }
    }

    if (data.nodeTombstones) {
      for (const [id, ts] of data.nodeTombstones) {
        this.nodeTombstones.set(id, ts)
      }
    }

    if (data.edgeTombstones) {
      for (const [id, ts] of data.edgeTombstones) {
        this.edgeTombstones.set(id, ts)
      }
    }
  }

  /**
   * Get an edge by ID.
   */
  public getEdge(id: string): GraphEdge | undefined {
    return this.edges.get(id)
  }

  /**
   * Retrieve incident edges for a node.
   */
  public getIncidentEdges(nodeId: string): GraphEdge[] {
    const result: GraphEdge[] = []
    for (const edge of this.edges.values()) {
      if (edge.sourceId === nodeId || edge.targetId === nodeId) {
        result.push(edge)
      }
    }

    return result
  }

  /**
   * Get a node by ID.
   */
  public getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id)
  }

  /**
   * Check if an edge has been deleted.
   */
  public isTombstonedEdge(id: string): boolean {
    return this.edgeTombstones.has(id)
  }

  /**
   * Check if a node has been deleted.
   */
  public isTombstonedNode(id: string): boolean {
    return this.nodeTombstones.has(id)
  }

  /**
   * Merge another MemoryGraphStore into this one.
   */
  public merge(other: any): void {
    // Check if other is a raw payload or an instance of MemoryGraphStore
    const isPayload = !other.nodes.has

    const otherNodeTombstones: Array<[string, number]> = isPayload
      ? other.nodeTombstones || []
      : [...other.nodeTombstones.entries()]

    const otherEdgeTombstones: Array<[string, number]> = isPayload
      ? other.edgeTombstones || []
      : [...other.edgeTombstones.entries()]

    const otherNodes: GraphNode[] = isPayload ? other.nodes || [] : [...other.nodes.values()]
    const otherEdges: GraphEdge[] = isPayload ? other.edges || [] : [...other.edges.values()]

    // 1. Merge node tombstones (take max timestamp)
    for (const [id, timestamp] of otherNodeTombstones) {
      const local = this.nodeTombstones.get(id)
      if (local === undefined || timestamp > local) {
        this.nodeTombstones.set(id, timestamp)
        this.nodes.delete(id)
      }
    }

    // 2. Merge edge tombstones (take max timestamp)
    for (const [id, timestamp] of otherEdgeTombstones) {
      const local = this.edgeTombstones.get(id)
      if (local === undefined || timestamp > local) {
        this.edgeTombstones.set(id, timestamp)
        this.edges.delete(id)
      }
    }

    // 3. Merge nodes
    for (const node of otherNodes) {
      this.addNode(node)
    }

    // 4. Merge edges
    for (const edge of otherEdges) {
      this.addEdge(edge)
    }

    // 5. Post-merge validation: Ensure deleted nodes' incident edges are also deleted
    for (const [nodeId, timestamp] of this.nodeTombstones.entries()) {
      const incident = this.getIncidentEdges(nodeId)
      for (const edge of incident) {
        this.deleteEdge(edge.id, timestamp)
      }
    }
  }

  /**
   * Serialize graph store to JSON.
   */
  public toJSON(): string {
    return JSON.stringify(
      {
        edges: [...this.edges.values()],
        edgeTombstones: [...this.edgeTombstones.entries()],
        nodes: [...this.nodes.values()],
        nodeTombstones: [...this.nodeTombstones.entries()],
      },
      null,
      2,
    )
  }
}
