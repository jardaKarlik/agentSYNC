import type {ConnectionResult, ITransportClient} from '@campfirein/brv-transport-client'
import type {Config} from '@oclif/core'

import {Config as OclifConfig} from '@oclif/core'
import {expect} from 'chai'
import sinon, {restore, stub} from 'sinon'

import Sync from '../../src/oclif/commands/sync.js'

class TestableSyncCommand extends Sync {
  private readonly mockConnector: () => Promise<ConnectionResult>

  constructor(mockConnector: () => Promise<ConnectionResult>, config: Config, argv: string[] = []) {
    super(argv, config)
    this.mockConnector = mockConnector
  }

  protected override getDaemonOptions() {
    return {
      maxRetries: 1,
      projectPath: '/test/project',
      retryDelayMs: 0,
      transportConnector: this.mockConnector
    }
  }
}

describe('Sync Command CLI tests', () => {
  let config: Config
  let loggedMessages: string[]
  let mockClient: sinon.SinonStubbedInstance<ITransportClient>
  let mockConnector: sinon.SinonStub<[], Promise<ConnectionResult>>

  before(async () => {
    config = await OclifConfig.load(import.meta.url)
  })

  beforeEach(() => {
    loggedMessages = []
    mockClient = {
      connect: stub().resolves(),
      disconnect: stub().resolves(),
      getClientId: stub().returns('test-client-id'),
      getState: stub().returns('connected'),
      isConnected: stub().resolves(true),
      requestWithAck: stub().resolves({}),
    } as unknown as sinon.SinonStubbedInstance<ITransportClient>

    mockConnector = stub<[], Promise<ConnectionResult>>().resolves({
      client: mockClient as unknown as ITransportClient,
      projectRoot: '/test/project',
    })
  })

  afterEach(() => {
    restore()
  })

  function createCommand(...argv: string[]): TestableSyncCommand {
    const command = new TestableSyncCommand(mockConnector, config, argv)
    stub(command, 'log').callsFake((msg?: string) => {
      if (msg) loggedMessages.push(msg)
    })
    return command
  }

  it('should run sync status and log workstation alignment details', async () => {
    ;(mockClient.requestWithAck as sinon.SinonStub)
      .withArgs('agentsync:status', {})
      .resolves({
        tier: 'FREE',
        workstations: [
          {aligned: true, name: 'STUDIO'},
          {aligned: false, name: 'LAPTOP'}
        ]
      })

    const cmd = createCommand('status')
    await cmd.run()

    const logged = loggedMessages.join('\n')
    expect(logged).to.contain('STUDIO: Aligned')
    expect(logged).to.contain('LAPTOP: Out of Sync')
    expect(logged).to.contain('Billing Tier: FREE')
  })

  it('should run sync push and invoke trigger_sync in daemon', async () => {
    ;(mockClient.requestWithAck as sinon.SinonStub)
      .withArgs('agentsync:trigger_sync', {})
      .resolves({message: 'Sync completed successfully'})

    const cmd = createCommand('push')
    await cmd.run()

    expect(loggedMessages.join('\n')).to.contain('Sync completed successfully')
  })
})
