import type {ITransportClient} from '@campfirein/brv-transport-client'
import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'

import {expect} from 'chai'
import {SinonStub, stub} from 'sinon'

import {registerAgentSyncTools} from '../../../../../src/server/infra/mcp/tools/agentsync-tools.js'

interface McpToolWrapper {
  cb: (args?: unknown) => Promise<{content: Array<{text: string; type: 'text'}>; isError?: boolean}>
}

describe('AgentSync MCP Tools - Unit Tests', () => {
  let mockServer: McpServer
  let mockClient: ITransportClient
  let registeredTools: Map<string, McpToolWrapper>
  let requestWithAckStub: SinonStub

  beforeEach(() => {
    registeredTools = new Map()
    mockServer = {
      registerTool(
        name: string,
        _config: unknown,
        cb: (args?: unknown) => Promise<{content: Array<{text: string; type: 'text'}>; isError?: boolean}>
      ) {
        registeredTools.set(name, {cb})
      }
    } as unknown as McpServer

    requestWithAckStub = stub()
    mockClient = {
      getState: stub().returns('connected'),
      isConnected: stub().resolves(true),
      requestWithAck: requestWithAckStub,
    } as unknown as ITransportClient
  })

  it('should register status, trigger_sync and add_memory tools', () => {
    registerAgentSyncTools(mockServer, () => mockClient)
    expect(registeredTools.has('agentsync_status')).to.be.true
    expect(registeredTools.has('agentsync_trigger_sync')).to.be.true
    expect(registeredTools.has('agentsync_add_memory')).to.be.true
  })

  it('should run agentsync_status and return JSON formatted string from daemon', async () => {
    registerAgentSyncTools(mockServer, () => mockClient)
    const statusHandler = registeredTools.get('agentsync_status')!.cb

    const daemonResponse = {
      tier: 'FREE',
      workstations: [{aligned: true, name: 'STUDIO'}],
    }
    requestWithAckStub.withArgs('agentsync:status', {}).resolves(daemonResponse)

    const result = await statusHandler()
    expect(result.isError).to.be.false
    expect(result.content[0].text).to.contain('STUDIO')
    expect(result.content[0].text).to.contain('FREE')
  })

  it('should run agentsync_trigger_sync and invoke sync in daemon', async () => {
    registerAgentSyncTools(mockServer, () => mockClient)
    const triggerHandler = registeredTools.get('agentsync_trigger_sync')!.cb

    requestWithAckStub.withArgs('agentsync:trigger_sync', {}).resolves({message: 'Sync OK'})

    const result = await triggerHandler()
    expect(result.isError).to.be.false
    expect(result.content[0].text).to.equal('Sync OK')
  })

  it('should run agentsync_add_memory and post details to daemon', async () => {
    registerAgentSyncTools(mockServer, () => mockClient)
    const addMemoryHandler = registeredTools.get('agentsync_add_memory')!.cb

    const args = {
      content: 'We use Mocha for testing.',
      relations: [{relationType: 'RELATED_TO', targetId: 'urn:node:test'}],
      title: 'Mocha test framework',
      type: 'fact',
    }

    requestWithAckStub.withArgs('agentsync:add_memory', args).resolves({nodeId: 'urn:node:123'})

    const result = await addMemoryHandler(args)
    expect(result.isError).to.be.false
    expect(result.content[0].text).to.contain('urn:node:123')
  })
})
