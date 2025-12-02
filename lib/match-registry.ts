// In-memory registry for tracking cancelled matches
// This allows the server to check if a match should stop between rounds

const cancelledMatches = new Set<string>()
const activeMatches = new Map<string, AbortController>()

export function registerMatch(matchId: string): AbortController {
  const controller = new AbortController()
  activeMatches.set(matchId, controller)
  return controller
}

export function cancelMatch(matchId: string): boolean {
  cancelledMatches.add(matchId)
  const controller = activeMatches.get(matchId)
  if (controller) {
    controller.abort()
    activeMatches.delete(matchId)
    return true
  }
  return false
}

export function isMatchCancelled(matchId: string): boolean {
  return cancelledMatches.has(matchId)
}

export function cleanupMatch(matchId: string) {
  cancelledMatches.delete(matchId)
  activeMatches.delete(matchId)
}

export function getActiveMatchIds(): string[] {
  return Array.from(activeMatches.keys())
}
