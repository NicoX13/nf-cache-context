import type { CacheTtl } from '../types'

export const FALLBACK_THRESHOLD = 83
export const BAR_CELLS = 20

export const ttlMs = (ttl: CacheTtl) => (ttl === '1h' ? 60 : 5) * 60_000

// Restzeit in ganzen Minuten (aufgerundet), 0 = abgelaufen
export function minutesLeft(lastAt: number, now: number, ttl: CacheTtl) {
  const rest = ttlMs(ttl) - (now - lastAt)
  return rest <= 0 ? 0 : Math.ceil(rest / 60_000)
}

export function cacheBar(minutes: number, ttl: CacheTtl) {
  const total = ttlMs(ttl) / 60_000
  const frac = Math.max(0, Math.min(1, minutes / total))
  const filled = minutes <= 0 ? 0 : Math.max(1, Math.round(frac * BAR_CELLS))
  const color = frac <= 0.1 ? 'error' : frac <= 0.25 ? 'warning' : 'success'

  return { filled: '▪'.repeat(filled), empty: '▫'.repeat(BAR_CELLS - filled), color } as const
}

export function hitRate(usage: {
  input_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}) {
  const total = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens

  return total === 0 ? null : Math.round((usage.cache_read_input_tokens / total) * 100)
}

export function weather(percent: number | null, threshold: number) {
  const ratio = (percent ?? 0) / threshold
  if (ratio <= 0.5) return '☀️'
  if (ratio <= 0.8) return '🌧️'

  return '⛈️'
}

// Letzte cache_creation im Transkript-Ende: welcher TTL wurde zuletzt geschrieben?
export function detectTtl(jsonl: string): CacheTtl | null {
  const blocks = jsonl.match(/"cache_creation":\{[^}]*\}/g) ?? []
  for (const block of [...blocks].reverse()) {
    const h1 = Number(/"ephemeral_1h_input_tokens":(\d+)/.exec(block)?.[1] ?? 0)
    const m5 = Number(/"ephemeral_5m_input_tokens":(\d+)/.exec(block)?.[1] ?? 0)
    if (h1 > 0) return '1h'
    if (m5 > 0) return '5m'
  }

  return null
}

// Lange Texte an Absätzen teilen, damit keine Log-Zeile abgeschnitten wird
export function chunkText(text: string, max = 1800) {
  const pieces: string[] = []
  const split = (part: string, sep: RegExp) => part.split(sep).filter(p => p.trim() !== '')

  for (const para of split(text, /\n\s*\n/)) {
    if (para.length <= max) { pieces.push(para); continue }
    for (const line of split(para, /\n/)) {
      for (let i = 0; i < line.length; i += max) pieces.push(line.slice(i, i + max))
    }
  }

  const chunks: string[] = []
  for (const piece of pieces) {
    const last = chunks[chunks.length - 1]
    if (last !== undefined && last.length + 2 + piece.length <= max) chunks[chunks.length - 1] = `${last}\n\n${piece}`
    else chunks.push(piece)
  }

  return chunks
}

// Rahmentext der Engine vor und nach der eigentlichen Zusammenfassung entfernen
export function stripFraming(text: string) {
  return text
    .replace(/^This session is being continued[^\n]*\n+(Summary:\n)?/, '')
    .replace(/\n+If you need specific details from before compaction[\s\S]*$/, '')
    .trim()
}

export const formatTokens = (n: number | undefined) =>
  n === undefined ? '?' : n.toLocaleString('de-DE')
