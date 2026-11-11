const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/

/**
 * The consent page's last line: where the person goes after deciding. Desktop apps and Claude Code get
 * their answer on a local address (127.0.0.1:8976), which read as odd on its own, so say "this computer".
 */
export function returnLine(clientName: string, redirectHost: string): string {
  return LOOPBACK.test(redirectHost)
    ? `Then you go back to ${clientName} on this computer.`
    : `Then you go back to ${clientName} at ${redirectHost}.`
}
