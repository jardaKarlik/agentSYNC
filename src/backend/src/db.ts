import pg from 'pg'

import type {GraphNode} from '../../agent/infra/memory/memory-graph-store.js'

export class AgentSyncDatabase {
  private pool: pg.Pool

  constructor(connectionString?: string) {
    this.pool = new pg.Pool({
      connectionString: connectionString || process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes('sslmode=') ? undefined : {
        rejectUnauthorized: false
      }
    })
  }

  /**
   * Close the pool.
   */
  public async close(): Promise<void> {
    await this.pool.end()
  }

  /**
   * Get all active nodes.
   */
  public async getNodes(): Promise<GraphNode[]> {
    const res = await this.pool.query('SELECT * FROM sync_nodes')
    return res.rows.map(row => ({
      confidence: row.confidence ? Number(row.confidence) : undefined,
      content: row.content,
      hash: row.hash,
      id: row.id,
      sourceWorkstation: row.source_workstation,
      timestamp: Number(row.timestamp),
      title: row.title,
      type: row.type
    }))
  }

  /**
   * Run schema migrations to set up graph tables.
   */
  public async initialize(): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      
      // 1. Nodes table
      await client.query(`
        CREATE TABLE IF NOT EXISTS sync_nodes (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          source_workstation TEXT NOT NULL,
          timestamp BIGINT NOT NULL,
          confidence DOUBLE PRECISION,
          hash TEXT NOT NULL
        )
      `)

      // 2. Edges table
      await client.query(`
        CREATE TABLE IF NOT EXISTS sync_edges (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL,
          target_id TEXT NOT NULL,
          relation_type TEXT NOT NULL,
          timestamp BIGINT NOT NULL
        )
      `)

      // 3. Node Tombstones table
      await client.query(`
        CREATE TABLE IF NOT EXISTS sync_node_tombstones (
          id TEXT PRIMARY KEY,
          timestamp BIGINT NOT NULL
        )
      `)

      // 4. Edge Tombstones table
      await client.query(`
        CREATE TABLE IF NOT EXISTS sync_edge_tombstones (
          id TEXT PRIMARY KEY,
          timestamp BIGINT NOT NULL
        )
      `)

      // 5. Shared Rules (Instructions files)
      await client.query(`
        CREATE TABLE IF NOT EXISTS sync_instructions (
          filename TEXT PRIMARY KEY,
          shared_rules TEXT NOT NULL,
          timestamp BIGINT NOT NULL
        )
      `)

      // 6. Workstation Agent Instructions (v2 support)
      await client.query(`
        CREATE TABLE IF NOT EXISTS sync_instructions_v2 (
          workstation_id TEXT NOT NULL,
          agent_name TEXT NOT NULL,
          filename TEXT NOT NULL,
          identity TEXT NOT NULL,
          shared_rules TEXT NOT NULL,
          timestamp BIGINT NOT NULL,
          PRIMARY KEY (workstation_id, agent_name, filename)
        )
      `)

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * Save graph nodes, applying LWW and Delete-Wins.
   */
  public async saveNode(node: GraphNode): Promise<void> {
    const client = await this.pool.connect()
    try {
      // Check if tombstoned by a newer delete
      const tombstoneRes = await client.query(
        'SELECT timestamp FROM sync_node_tombstones WHERE id = $1',
        [node.id]
      )
      if (tombstoneRes.rows.length > 0 && Number(tombstoneRes.rows[0].timestamp) >= node.timestamp) {
        return
      }

      // Check if existing is newer
      const existingRes = await client.query(
        'SELECT timestamp FROM sync_nodes WHERE id = $1',
        [node.id]
      )
      if (existingRes.rows.length > 0 && Number(existingRes.rows[0].timestamp) >= node.timestamp) {
        return
      }

      // Save/Upsert
      await client.query(`
        INSERT INTO sync_nodes (id, type, title, content, source_workstation, timestamp, confidence, hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          type = EXCLUDED.type,
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          source_workstation = EXCLUDED.source_workstation,
          timestamp = EXCLUDED.timestamp,
          confidence = EXCLUDED.confidence,
          hash = EXCLUDED.hash
      `, [
        node.id,
        node.type,
        node.title,
        node.content,
        node.sourceWorkstation,
        node.timestamp,
        node.confidence ?? null,
        node.hash
      ])

      // Delete older tombstone if superseded
      if (tombstoneRes.rows.length > 0) {
        await client.query('DELETE FROM sync_node_tombstones WHERE id = $1', [node.id])
      }
    } finally {
      client.release()
    }
  }

  /**
   * Save instruction file configuration for a specific workstation/agent.
   */
  public async saveInstructions(
    workstationId: string,
    agentName: string,
    filename: string,
    identity: string,
    sharedRules: string,
    timestamp: number
  ): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query(`
        INSERT INTO sync_instructions_v2 (workstation_id, agent_name, filename, identity, shared_rules, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (workstation_id, agent_name, filename) DO UPDATE SET
          identity = EXCLUDED.identity,
          shared_rules = EXCLUDED.shared_rules,
          timestamp = EXCLUDED.timestamp
      `, [workstationId, agentName, filename, identity, sharedRules, timestamp])
    } finally {
      client.release()
    }
  }

  /**
   * Get all instruction files for a specific workstation/agent.
   */
  public async getInstructions(workstationId: string, agentName: string): Promise<any[]> {
    const res = await this.pool.query(
      'SELECT * FROM sync_instructions_v2 WHERE workstation_id = $1 AND agent_name = $2',
      [workstationId, agentName]
    )
    return res.rows
  }

  /**
   * Get list of all registered workstations and agents.
   */
  public async getRegisteredWorkstations(): Promise<Array<{workstationId: string, agentName: string}>> {
    const res = await this.pool.query('SELECT DISTINCT workstation_id, agent_name FROM sync_instructions_v2')
    return res.rows.map(row => ({
      workstationId: row.workstation_id,
      agentName: row.agent_name
    }))
  }
}
