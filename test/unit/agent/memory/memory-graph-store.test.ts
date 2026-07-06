import {expect} from 'chai'
import {MemoryGraphStore, GraphNode, GraphEdge} from '../../../../src/agent/infra/memory/memory-graph-store.js'

describe('MemoryGraphStore - Unit Tests', () => {
  let store: MemoryGraphStore

  beforeEach(() => {
    store = new MemoryGraphStore()
  })

  describe('Node Operations', () => {
    it('should add and retrieve a graph node', () => {
      const node: GraphNode = {
        id: 'urn:agentsync:node:1',
        type: 'fact',
        title: 'Workstation Definition',
        content: 'Workstation is set to STUDIO',
        sourceWorkstation: 'STUDIO',
        timestamp: 1000,
        confidence: 0.9,
        hash: 'hash1',
      }

      store.addNode(node)
      const retrieved = store.getNode('urn:agentsync:node:1')
      expect(retrieved).to.deep.equal(node)
    })

    it('should support updating nodes with newer timestamp', () => {
      const node1: GraphNode = {
        id: 'urn:agentsync:node:1',
        type: 'fact',
        title: 'Workstation Definition',
        content: 'Workstation is set to STUDIO',
        sourceWorkstation: 'STUDIO',
        timestamp: 1000,
        confidence: 0.9,
        hash: 'hash1',
      }

      const node2: GraphNode = {
        ...node1,
        content: 'Workstation is set to LAPTOP',
        timestamp: 2000,
      }

      store.addNode(node1)
      store.addNode(node2)
      expect(store.getNode('urn:agentsync:node:1')?.content).to.equal('Workstation is set to LAPTOP')
    })

    it('should delete a node and flag it in tombstones', () => {
      const node: GraphNode = {
        id: 'urn:agentsync:node:1',
        type: 'fact',
        title: 'Workstation Definition',
        content: 'Workstation is set to STUDIO',
        sourceWorkstation: 'STUDIO',
        timestamp: 1000,
        confidence: 0.9,
        hash: 'hash1',
      }

      store.addNode(node)
      store.deleteNode('urn:agentsync:node:1', 1500)

      expect(store.getNode('urn:agentsync:node:1')).to.be.undefined
      expect(store.isTombstonedNode('urn:agentsync:node:1')).to.be.true
    })
  })

  describe('Edge Operations', () => {
    it('should add and retrieve edges', () => {
      const edge: GraphEdge = {
        id: 'urn:agentsync:edge:1',
        sourceId: 'urn:agentsync:node:1',
        targetId: 'urn:agentsync:node:2',
        relationType: 'DEPENDS_ON',
        timestamp: 1000,
      }

      store.addEdge(edge)
      expect(store.getEdge('urn:agentsync:edge:1')).to.deep.equal(edge)
    })

    it('should retrieve incident edges and neighbors', () => {
      const edge1: GraphEdge = {
        id: 'urn:agentsync:edge:1',
        sourceId: 'urn:agentsync:node:1',
        targetId: 'urn:agentsync:node:2',
        relationType: 'DEPENDS_ON',
        timestamp: 1000,
      }

      const edge2: GraphEdge = {
        id: 'urn:agentsync:edge:2',
        sourceId: 'urn:agentsync:node:1',
        targetId: 'urn:agentsync:node:3',
        relationType: 'RELATED_TO',
        timestamp: 1000,
      }

      store.addEdge(edge1)
      store.addEdge(edge2)

      const incident = store.getIncidentEdges('urn:agentsync:node:1')
      expect(incident.length).to.equal(2)
      expect(incident.map(e => e.id)).to.include('urn:agentsync:edge:1').and.include('urn:agentsync:edge:2')
    })
  })

  describe('CRDT Merge Logic', () => {
    it('should merge two stores using LWW and Delete-Wins tombstones', () => {
      const storeA = new MemoryGraphStore()
      const storeB = new MemoryGraphStore()

      // Node 1: Created on A, updated on B (with newer timestamp)
      const n1_v1: GraphNode = {
        id: 'urn:agentsync:node:1',
        type: 'fact',
        title: 'Rule 1',
        content: 'Original Content',
        sourceWorkstation: 'STUDIO',
        timestamp: 100,
        hash: 'h1',
      }
      const n1_v2: GraphNode = {
        ...n1_v1,
        content: 'Updated Content',
        timestamp: 200,
      }
      storeA.addNode(n1_v1)
      storeB.addNode(n1_v2)

      // Node 2: Created on A, deleted on B (Delete-Wins)
      const n2: GraphNode = {
        id: 'urn:agentsync:node:2',
        type: 'task',
        title: 'Task 2',
        content: 'Run build',
        sourceWorkstation: 'STUDIO',
        timestamp: 100,
        hash: 'h2',
      }
      storeA.addNode(n2)
      storeB.deleteNode('urn:agentsync:node:2', 150)

      // Node 3: Created on B only
      const n3: GraphNode = {
        id: 'urn:agentsync:node:3',
        type: 'fact',
        title: 'Rule 3',
        content: 'New Fact',
        sourceWorkstation: 'LAPTOP',
        timestamp: 120,
        hash: 'h3',
      }
      storeB.addNode(n3)

      // Merge store B into store A
      storeA.merge(storeB)

      // Assertions
      // 1. Node 1 should have updated content
      expect(storeA.getNode('urn:agentsync:node:1')?.content).to.equal('Updated Content')

      // 2. Node 2 should be deleted (Delete-Wins)
      expect(storeA.getNode('urn:agentsync:node:2')).to.be.undefined
      expect(storeA.isTombstonedNode('urn:agentsync:node:2')).to.be.true

      // 3. Node 3 should be added
      expect(storeA.getNode('urn:agentsync:node:3')?.title).to.equal('Rule 3')
    })
  })
})
