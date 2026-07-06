import {Args, Command, Flags} from '@oclif/core'

import {AgentSyncConfigStore} from '../../server/infra/sync/sync-config-store.js'
import {type DaemonClientOptions, formatConnectionError, withDaemonRetry} from '../lib/daemon-client.js'
import {writeJsonResponse} from '../lib/json-response.js'

export default class Sync extends Command {
  public static args = {
    action: Args.string({
      default: 'status',
      description: 'Sync action to perform',
      options: ['status', 'push', 'pull', 'configure'],
      required: false,
    }),
  }
public static description = 'Manage AgentSync memory graph and configuration files synchronization'
public static examples = [
    '# Check sync status',
    '<%= config.bin %> sync status',
    '',
    '# Trigger manual push sync',
    '<%= config.bin %> sync push',
    '',
    '# Trigger manual pull sync',
    '<%= config.bin %> sync pull',
  ]
public static flags = {
    format: Flags.string({
      default: 'text',
      description: 'Output format (text or json)',
      options: ['text', 'json'],
    }),
    workstation: Flags.string({
      char: 'w',
      description: 'Workstation identity name',
    }),
    agent: Flags.string({
      char: 'a',
      description: 'Agent client name (e.g. claude-desktop, cline, antigravity)',
    }),
  }

  protected getDaemonOptions(): DaemonClientOptions {
    return {projectPath: process.cwd()}
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(Sync)
    const format = flags.format as 'json' | 'text'
    const {action} = args

    try {
      const daemonOptions = this.getDaemonOptions()

      switch (action) {
      case 'configure': {
        const configStore = new AgentSyncConfigStore(process.cwd())
        const workstationId = flags.workstation || process.env.COMPUTERNAME || 'STUDIO'
        const agentName = flags.agent || 'claude-desktop'

        await configStore.save({workstationId, agentName})

        this.log('Interactive workstation configuration:')
        this.log(`  AgentSync is linked.`)
        this.log(`  Workstation ID: ${workstationId}`)
        this.log(`  Agent Name:     ${agentName}`)
      
      break;
      }

      case 'pull': 
      case 'push': {
        const configStore = new AgentSyncConfigStore(process.cwd())
        const config = await configStore.load()
        const response = await withDaemonRetry<{message: string}>(
          async (client) => client.requestWithAck<{message: string}>('agentsync:trigger_sync', {
            action,
            agentName: config.agentName,
            workstationId: config.workstationId,
          }),
          daemonOptions,
        )

        if (format === 'json') {
          writeJsonResponse({command: `sync ${action}`, data: response, success: true})
        } else {
          this.log(response.message || 'Sync completed successfully')
        }
      
      break;
      }

      case 'status': {
        const configStore = new AgentSyncConfigStore(process.cwd())
        const config = await configStore.load()
        const response = await withDaemonRetry<{
          tier: string
          workstations: Array<{aligned: boolean; name: string}>
        }>(
          async (client) =>
            client.requestWithAck<{tier: string; workstations: Array<{aligned: boolean; name: string}>}>(
              'agentsync:status',
              {
                agentName: config.agentName,
                workstationId: config.workstationId,
              },
            ),
          daemonOptions,
        )

        if (format === 'json') {
          writeJsonResponse({command: 'sync status', data: response, success: true})
        } else {
          this.log(`AgentSync Workstation Status:`)
          for (const ws of response.workstations || []) {
            const statusText = ws.aligned ? 'Aligned' : 'Out of Sync'
            this.log(`  - ${ws.name}: ${statusText}`)
          }

          this.log(`Billing Tier: ${response.tier || 'FREE'}`)
        }
      
      break;
      }
      // No default
      }
    } catch (error) {
      if (format === 'json') {
        writeJsonResponse({command: 'sync', data: {error: formatConnectionError(error)}, success: false})
      } else {
        this.log(formatConnectionError(error))
      }
    }
  }
}
