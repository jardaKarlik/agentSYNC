import {expect} from 'chai'

import {AgentSyncBackend} from '../../../../src/backend/src/backend-engine.js'

describe('AgentSync Backend - Unit Tests', () => {
  let backend: AgentSyncBackend

  beforeEach(() => {
    // Initialize in-memory DB mode for testing
    backend = new AgentSyncBackend({inMemory: true})
  })

  describe('Sync Push & Pull API', () => {
    it('should save pushed graph nodes and edges', async () => {
      const payload = {
        edges: [],
        edgeTombstones: [],
        nodes: [
          {
            content: 'Hello World',
            hash: 'h1',
            id: 'urn:node:1',
            sourceWorkstation: 'STUDIO',
            timestamp: 1000,
            title: 'Test Node',
            type: 'fact',
          }
        ],
        nodeTombstones: []
      }

      await backend.handlePush('user-1', payload)

      const pulled = await backend.handlePull('user-1')
      expect(pulled.nodes.length).to.equal(1)
      expect(pulled.nodes[0].title).to.equal('Test Node')
    })

    it('should resolve conflicts using LWW and tombstones', async () => {
      const payload1 = {
        edges: [],
        edgeTombstones: [],
        nodes: [
          {
            content: 'Content A',
            hash: 'h1',
            id: 'urn:node:1',
            sourceWorkstation: 'STUDIO',
            timestamp: 1000,
            title: 'Test Node',
            type: 'fact',
          }
        ],
        nodeTombstones: []
      }

      const payload2 = {
        edges: [],
        edgeTombstones: [],
        nodes: [
          {
            content: 'Content B',
            hash: 'h2',
            id: 'urn:node:1',
            sourceWorkstation: 'LAPTOP',
            timestamp: 2000,
            title: 'Test Node',
            type: 'fact',
          }
        ],
        nodeTombstones: []
      }

      await backend.handlePush('user-1', payload1)
      await backend.handlePush('user-1', payload2)

      const pulled = await backend.handlePull('user-1')
      expect(pulled.nodes[0].content).to.equal('Content B')
    })
  })
})
