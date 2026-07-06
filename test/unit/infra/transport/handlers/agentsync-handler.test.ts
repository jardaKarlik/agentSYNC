import {expect} from 'chai'
import sinon, {SinonStub, stub} from 'sinon'
import {AgentSyncHandler} from '../../../../../src/server/infra/transport/handlers/agentsync-handler.js'

describe('AgentSyncHandler - Unit Tests', () => {
  let handler: AgentSyncHandler
  let mockTransport: any
  let mockBillingService: any
  let mockResolveProjectPath: SinonStub

  beforeEach(() => {
    mockTransport = {
      onRequest: stub(),
    }
    mockBillingService = {
      isPaidUser: stub().resolves(true),
    }
    mockResolveProjectPath = stub().returns('/mock/project')

    handler = new AgentSyncHandler({
      billingService: mockBillingService,
      resolveProjectPath: mockResolveProjectPath,
      transport: mockTransport,
    })
  })

  it('should register handlers on setup', () => {
    handler.setup()
    expect(mockTransport.onRequest.calledWith('agentsync:status')).to.be.true
    expect(mockTransport.onRequest.calledWith('agentsync:trigger_sync')).to.be.true
    expect(mockTransport.onRequest.calledWith('agentsync:add_memory')).to.be.true
  })
})
