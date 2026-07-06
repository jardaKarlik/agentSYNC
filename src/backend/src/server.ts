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
  socket.on('agentsync:status', async (data: unknown, callback: (response: unknown) => void) => {
    try {
      callback({
        tier: 'FREE',
        workstations: [
          {aligned: true, name: 'STUDIO-PC'},
          {aligned: true, name: 'LAPTOP-PRO'},
          {aligned: false, name: 'GCP-VM-AGENT'},
        ],
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      callback({error: message})
    }
  })

  // 2. Push sync
  socket.on('agentsync:push', async (payload: unknown, callback: (response: unknown) => void) => {
    try {
      const typedPayload = payload as SyncGraphPayload
      if (typedPayload && typedPayload.nodes && Array.isArray(typedPayload.nodes)) {
        // Run parallel saves to resolve no-await-in-loop
        await Promise.all(typedPayload.nodes.map((node: GraphNode) => db.saveNode(node)))
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
  socket.on('agentsync:pull', async (data: unknown, callback: (response: unknown) => void) => {
    try {
      const nodes = await db.getNodes()
      callback({
        edges: [],
        edgeTombstones: [],
        nodes,
        nodeTombstones: [],
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
