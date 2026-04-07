import * as p from '@clack/prompts'
import pc from 'picocolors'
import { LOCAL_CLI_COMMAND } from '../constants.js'
import { findInstallDir, readConfig } from '../services/config-store.js'
import { dockerComposeUp } from '../services/docker.js'

export async function startCommand() {
  const dir = findInstallDir()
  const config = readConfig(dir)
  if (!config) {
    p.log.error('No Launch LMS installation found in the current directory.')
    p.log.info(`Run \`${LOCAL_CLI_COMMAND} setup\` to set up a new installation.`)
    process.exit(1)
  }

  p.intro(pc.cyan('Starting Launch LMS'))
  try {
    dockerComposeUp(config.installDir)
    p.log.success('Launch LMS is running!')
  } catch {
    p.log.error('Failed to start services. Check Docker output above.')
    process.exit(1)
  }
}
