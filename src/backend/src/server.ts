import express from 'express'
import {createServer} from 'node:http'
import {Server} from 'socket.io'

import type {GraphNode} from '../../agent/infra/memory/memory-graph-store.js'
import type {SyncGraphPayload} from './backend-engine.js'

import {AgentSyncDatabase} from './db.js'

const app = express()
const server = createServer(app)
const io = new Server(server, {
  cors: {
    origin: '*',
  },
})

const PORT = process.env.PORT || 8080
const db = new AgentSyncDatabase()

app.use(express.json())

app.get('/health', (req, res) => {
  res.json({status: 'healthy', timestamp: new Date().toISOString()})
})

// Socket.IO sync namespace
io.on('connection', (socket) => {
  console.log(`Workstation connected: ${socket.id}`)

  // 1. Status query
  socket.on('agentsync:status', async (payload: any, callback: (response: unknown) => void) => {
    try {
      const list = await db.getRegisteredWorkstations()
      // Map to alignment workstations
      const currentWorkstation = payload?.workstationId || 'STUDIO'
      const workstations = list.map((item) => ({
        aligned: item.workstationId === currentWorkstation,
        name: `${item.workstationId} (${item.agentName})`,
      }))

      // If empty, add a default fallback
      if (workstations.length === 0) {
        workstations.push({aligned: true, name: `${currentWorkstation} (claude-desktop)`})
      }

      callback({
        tier: 'FREE',
        workstations,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      callback({error: message})
    }
  })

  // 2. Push sync
  socket.on('agentsync:push', async (payload: any, callback: (response: unknown) => void) => {
    try {
      if (payload && payload.nodes && Array.isArray(payload.nodes)) {
        await Promise.all(payload.nodes.map((node: GraphNode) => db.saveNode(node)))
      }

      if (payload && payload.files) {
        const workstationId = payload.workstationId || 'STUDIO'
        const agentName = payload.agentName || 'claude-desktop'
        for (const [filename, fileData] of Object.entries(payload.files)) {
          const typedFileData = fileData as any
          await db.saveInstructions(
            workstationId,
            agentName,
            filename,
            typedFileData.identity || '',
            typedFileData.sharedRules || '',
            Date.now()
          )
        }
      }

      callback({
        message: 'Sync push merged successfully',
        success: true,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      callback({error: message})
    }
  })

  // 3. Pull sync
  socket.on('agentsync:pull', async (payload: any, callback: (response: unknown) => void) => {
    try {
      const workstationId = payload?.workstationId || 'STUDIO'
      const agentName = payload?.agentName || 'claude-desktop'

      const nodes = await db.getNodes()
      const filesRes = await db.getInstructions(workstationId, agentName)

      const files: Record<string, any> = {}
      for (const row of filesRes) {
        files[row.filename] = {
          identity: row.identity,
          rawContent: `<!-- BEGIN AGENTSYNC:IDENTITY -->\n${row.identity}\n<!-- END AGENTSYNC:IDENTITY -->\n\n<!-- BEGIN AGENTSYNC:SHARED_RULES -->\n${row.shared_rules}\n<!-- END AGENTSYNC:SHARED_RULES -->`,
          sharedRules: row.shared_rules,
        }
      }

      callback({
        edges: [],
        edgeTombstones: [],
        nodes,
        nodeTombstones: [],
        files,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      callback({error: message})
    }
  })
})

// Initialize DB and start server using top-level await
console.log('Initializing AgentSync Database schema...')
await db.initialize()
console.log('Database initialized successfully.')

server.listen(PORT, () => {
  console.log(`AgentSync Backend listening on port ${PORT}`)
})
