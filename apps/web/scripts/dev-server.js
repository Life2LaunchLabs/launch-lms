#!/usr/bin/env node

const { existsSync } = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const appRoot = process.cwd()
const certFile = path.resolve(appRoot, '../../certs/local.pem')
const keyFile = path.resolve(appRoot, '../../certs/local-key.pem')

const args = ['dev', '--hostname', '0.0.0.0']

if (existsSync(certFile) && existsSync(keyFile)) {
  args.push(
    '--experimental-https',
    '--experimental-https-cert',
    certFile,
    '--experimental-https-key',
    keyFile
  )
  console.log(`[web] HTTPS dev enabled with local certs: ${certFile}`)
} else {
  console.log('[web] Local dev certs not found, starting plain HTTP dev server.')
  console.log('[web] Run `bash scripts/setup-dev-certs.sh` from the repo root to enable sslip.io HTTPS dev.')
}

const child = spawn('next', args, {
  stdio: 'inherit',
  cwd: appRoot,
  env: process.env,
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
