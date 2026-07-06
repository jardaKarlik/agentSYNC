import {FSWatcher, watch} from 'node:fs'
import * as fs from 'node:fs/promises'
import {join} from 'node:path'

export interface SyncFilePayload {
  identity: string
  rawContent: string
  sharedRules: string
}

export interface SyncPayload {
  files: Record<string, SyncFilePayload>
}

export interface SyncManagerDeps {
  billingService: {
    isPaidUser(sessionKey: string): Promise<boolean>
  }
  onFileChange?: (filename: string) => void
  projectPath: string
  sessionKey: string
}

export class SyncManager {
  private readonly billingService: SyncManagerDeps['billingService']
  private readonly onFileChange?: (filename: string) => void
  private readonly projectPath: string
  private readonly sessionKey: string
  private watchers: FSWatcher[] = []

  constructor(deps: SyncManagerDeps) {
    this.projectPath = deps.projectPath
    this.billingService = deps.billingService
    this.sessionKey = deps.sessionKey
    this.onFileChange = deps.onFileChange
  }

  /**
   * Parse a file for AgentSync identity and shared rules segments.
   */
  public async parseInstructionFile(filename: string): Promise<SyncFilePayload> {
    const filePath = join(this.projectPath, filename)
    let content = ''
    try {
      content = await fs.readFile(filePath, 'utf8')
    } catch {
      // Return empty if file not found
      return {identity: '', rawContent: '', sharedRules: ''}
    }

    const identityRegex = /<!-- BEGIN AGENTSYNC:IDENTITY -->([\s\S]*?)<!-- END AGENTSYNC:IDENTITY -->/
    const sharedRulesRegex = /<!-- BEGIN AGENTSYNC:SHARED_RULES -->([\s\S]*?)<!-- END AGENTSYNC:SHARED_RULES -->/

    const identityMatch = content.match(identityRegex)
    const sharedRulesMatch = content.match(sharedRulesRegex)

    return {
      identity: identityMatch ? identityMatch[1].trim() : '',
      rawContent: content,
      sharedRules: sharedRulesMatch ? sharedRulesMatch[1].trim() : '',
    }
  }

  /**
   * Prepares the payload to push to the cloud, validating line limits.
   */
  public async prepareSyncPayload(): Promise<SyncPayload> {
    const filesToSync = ['agent.md', 'soul.md']
    const files: Record<string, SyncFilePayload> = {}

    await Promise.all(
      filesToSync.map(async (filename) => {
        const filePath = join(this.projectPath, filename)
        let exists = false
        try {
          await fs.access(filePath)
          exists = true
        } catch {
          return
        }

        if (exists) {
          const content = await fs.readFile(filePath, 'utf8')
          const lines = content.split('\n')

          if (lines.length > 145) {
            const isPaid = await this.billingService.isPaidUser(this.sessionKey)
            if (!isPaid) {
              throw new Error(
                `Free plan is limited to 145 lines for instructions files (${filename} has ${lines.length} lines). Please upgrade your plan to sync larger files.`
              )
            }
          }

          const parsed = await this.parseInstructionFile(filename)
          files[filename] = parsed
        }
      })
    )

    return {files}
  }

  /**
   * Watch files agent.md and soul.md for changes.
   */
  public startWatching(): void {
    const filesToWatch = ['agent.md', 'soul.md']
    for (const filename of filesToWatch) {
      const filePath = join(this.projectPath, filename)
      try {
        const watcher = watch(filePath, (eventType) => {
          if (eventType === 'change' && this.onFileChange) {
            this.onFileChange(filename)
          }
        })
        this.watchers.push(watcher)
      } catch {
        // File might not exist yet, skip watching
      }
    }
  }

  /**
   * Stop watching files.
   */
  public stopWatching(): void {
    for (const watcher of this.watchers) {
      watcher.close()
    }

    this.watchers = []
  }
}
