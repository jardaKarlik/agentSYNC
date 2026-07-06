import {expect} from 'chai'
import * as fs from 'node:fs/promises'
import {join} from 'node:path'
import {SinonStub, stub} from 'sinon'

import {SyncManager} from '../../../../src/server/infra/sync/sync-manager.js'

interface MockBillingService {
  isPaidUser: SinonStub<[string], Promise<boolean>>
}

describe('SyncManager - Unit Tests', () => {
  const tempDir = join(process.cwd(), 'test-temp-sync')
  let syncManager: SyncManager
  let mockBillingService: MockBillingService

  before(async () => {
    await fs.mkdir(tempDir, {recursive: true})
  })

  after(async () => {
    await fs.rm(tempDir, {force: true, recursive: true})
  })

  beforeEach(() => {
    mockBillingService = {
      isPaidUser: stub().resolves(false) as unknown as SinonStub<[string], Promise<boolean>>,
    }
    syncManager = new SyncManager({
      billingService: mockBillingService,
      projectPath: tempDir,
      sessionKey: 'test-session-key',
    })
  })

  afterEach(async () => {
    syncManager.stopWatching()
    // Clean up files in temp dir in parallel to avoid await in loop
    const files = await fs.readdir(tempDir)
    await Promise.all(files.map((file) => fs.unlink(join(tempDir, file))))
  })

  describe('Markdown Section Parsing', () => {
    it('should extract shared rules and preserve workstation identity sections', async () => {
      const fileContent = `# Rules

<!-- BEGIN AGENTSYNC:IDENTITY -->
Workstation: STUDIO
<!-- END AGENTSYNC:IDENTITY -->

<!-- BEGIN AGENTSYNC:SHARED_RULES -->
- Always use optional properties
- Run tests in memory
<!-- END AGENTSYNC:SHARED_RULES -->`

      await fs.writeFile(join(tempDir, 'agent.md'), fileContent)

      const parsed = await syncManager.parseInstructionFile('agent.md')
      expect(parsed.identity).to.contain('Workstation: STUDIO')
      expect(parsed.sharedRules).to.contain('- Always use optional properties')
    })
  })

  describe('Monetization & Line Limits', () => {
    it('should reject file sync if lines > 145 and user is FREE', async () => {
      // Create a file with 150 lines
      const longRules = Array.from({length: 150}, (_, i) => `- Rule line ${i}`).join('\n')
      const fileContent = `# Rules
<!-- BEGIN AGENTSYNC:SHARED_RULES -->
${longRules}
<!-- END AGENTSYNC:SHARED_RULES -->`

      await fs.writeFile(join(tempDir, 'agent.md'), fileContent)

      mockBillingService.isPaidUser.resolves(false)

      try {
        await syncManager.prepareSyncPayload()
        throw new Error('Expected to throw')
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        expect(message).to.contain('Free plan is limited to 145 lines')
      }
    })

    it('should accept file sync if lines > 145 and user is PAID', async () => {
      const longRules = Array.from({length: 150}, (_, i) => `- Rule line ${i}`).join('\n')
      const fileContent = `# Rules
<!-- BEGIN AGENTSYNC:SHARED_RULES -->
${longRules}
<!-- END AGENTSYNC:SHARED_RULES -->`

      await fs.writeFile(join(tempDir, 'agent.md'), fileContent)

      mockBillingService.isPaidUser.resolves(true)

      const payload = await syncManager.prepareSyncPayload()
      expect(payload.files['agent.md']).to.exist
    })
  })
})
