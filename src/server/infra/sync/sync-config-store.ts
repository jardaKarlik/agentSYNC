import * as fs from 'node:fs/promises'
import {dirname, join} from 'node:path'

export interface AgentSyncConfig {
  agentName: string
  workstationId: string
}

export class AgentSyncConfigStore {
  private readonly configPath: string

  constructor(projectPath: string) {
    this.configPath = join(projectPath, '.brv', 'agentsync.json')
  }

  public async load(): Promise<AgentSyncConfig> {
    try {
      const data = await fs.readFile(this.configPath, 'utf8')
      const parsed = JSON.parse(data)
      return {
        agentName: parsed.agentName || 'claude-desktop',
        workstationId: parsed.workstationId || process.env.COMPUTERNAME || 'STUDIO',
      }
    } catch {
      return {
        agentName: 'claude-desktop',
        workstationId: process.env.COMPUTERNAME || 'STUDIO',
      }
    }
  }

  public async save(config: AgentSyncConfig): Promise<void> {
    try {
      await fs.mkdir(dirname(this.configPath), {recursive: true})
      await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf8')
    } catch (error) {
      throw new Error(`Failed to save AgentSync config: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
