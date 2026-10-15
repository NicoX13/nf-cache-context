import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CacheTtl, Kontext } from '../types'
import {
  FALLBACK_THRESHOLD, cacheBar, stripFraming, detectTtl, formatTokens, hitRate, minutesLeft, weather,
} from './logic'

const lastAt = atom({ plugin: 'nf-cache-context', key: 'lastAt' } as const, null)
const ttl = atom({ plugin: 'nf-cache-context', key: 'ttl' } as const, '5m')
const hit = atom({ plugin: 'nf-cache-context', key: 'hitRate' } as const, null)
const kontext = atom({ plugin: 'nf-cache-context', key: 'kontext' } as const, {
  percent: null, threshold: FALLBACK_THRESHOLD, isThresholdRead: false,
})
const tick = atom({ plugin: 'nf-cache-context', key: 'tick' } as const, 0)
const isCollapsed = atom({ plugin: 'nf-cache-context', key: 'isCollapsed' } as const, false)
const isQueued = atom({ plugin: 'nf-cache-context', key: 'isQueued' } as const, false)
const isBusy = atom({ plugin: 'nf-cache-context', key: 'isBusy' } as const, false)

type $ = EngineInterface

async function readThreshold($: $, known: number | null): Promise<Kontext> {
  let percent = known
  try {
    const { context } = await $.session.usage({ breakdown: 'summary' })
    percent = known ?? context.percent ?? null
    const limit = context.breakdown?.autoCompactThreshold
    if (limit !== undefined && context.window > 0) {
      return { percent, threshold: Math.round((limit / context.window) * 100), isThresholdRead: true }
    }
  } catch {
    // Schwelle nicht lesbar: Rückfall auf 83 %
  }

  return { percent, threshold: FALLBACK_THRESHOLD, isThresholdRead: false }
}

async function learnTtl($: $, transcript: string) {
  if (transcript === '') return
  const { stdout } = await $.process.run(['tail', '-c', '600000', transcript])
  const found = detectTtl(stdout)
  if (found === null) return
  await update($, ttl, () => found)
  await $.store.set('ttl', found)
}

// Diagnose nur ins Debug-Log von Claude Code, nie in den Chat
function debug($: $, text: string) {
  $.ui.log(text, { to: 'debug' })
}

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err))

// Ein Aufruf, der in der Desktop App hängen kann, bekommt ein Zeitlimit
function withTimeout<T>($: $, work: Promise<T>, ms: number) {
  return new Promise<T>((resolve, reject) => {
    const stop = $.clock.after(ms, () => reject(new Error(`keine Antwort nach ${ms / 1000}s`)))
    work.then(v => (stop.cancel(), resolve(v)), err => (stop.cancel(), reject(err)))
  })
}

// Compact sofort; scheitert der direkte Aufruf, über den Befehl /compact
async function runCompact($: $) {
  await debug($, 'runCompact: session.compact')
  try {
    const result = await withTimeout($, $.session.compact(), 15_000)
    await debug($, result.skip !== undefined ? `übersprungen: ${result.skip}` : 'session.compact ok')

    return
  } catch (err) {
    await debug($, `session.compact fehlgeschlagen: ${reason(err)}`)
  }
  // Der Befehl kehrt erst zurück, wenn das Compact fertig ist – das dauert, daher kein Zeitlimit
  try {
    await debug($, 'runCompact: command.run compact')
    await $.command.run({ command: 'compact' })
    await debug($, 'command.run ok')
  } catch (err) {
    await debug($, `command.run compact fehlgeschlagen: ${reason(err)}`)
    await update($, isQueued, () => false)
    $.ui.toast('Compact konnte nicht gestartet werden – bitte /compact tippen.')
  }
}

async function compact($: $) {
  const busy = await read($, isBusy)
  await debug($, `Klick auf Compact, Claude arbeitet: ${busy}`)
  if (!busy) return runCompact($)
  // Während Claude arbeitet: vormerken, turn.complete startet es danach
  await update($, isQueued, () => true)
}

export const register: Register = on => {
  let shownMinutes = -1

  on('session.start', async ($, e, next) => {
    await update($, isBusy, () => false)
    await debug($, 'geladen')
    const storedTtl = await $.store.get('ttl')
    if (storedTtl === '1h' || storedTtl === '5m') await update($, ttl, () => storedTtl as CacheTtl)
    if ((await $.store.get('isCollapsed')) === true) await update($, isCollapsed, () => true)
    void readThreshold($, null).then(k => update($, kontext, () => k))

    // Nur neu zeichnen, wenn sich die angezeigte Minute ändert
    $.clock.every(10_000, () => {
      void (async () => {
        const at = await read($, lastAt)
        if (at === null) return
        const minutes = minutesLeft(at, await $.clock.now(), await read($, ttl))
        if (minutes === shownMinutes) return
        shownMinutes = minutes
        await update($, tick, n => n + 1)
      })()
    })

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (e.agentId === undefined && result.usage !== null) {
      const rate = hitRate(result.usage)
      const at = await $.clock.now()
      await update($, lastAt, () => at)
      await update($, hit, () => rate)
    }

    return result
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, isBusy, () => true)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    await update($, isBusy, () => false)
    if (await read($, isQueued)) {
      await debug($, 'Turn fertig, starte eingereihtes Compact')
      $.clock.after(1500, () => void runCompact($).catch(err => debug($, reason(err))))
    }

    return result
  })

  on('classic.Stop', async ($, e, next) => {
    const result = await next(e)
    void learnTtl($, e.transcript_path).catch(() => undefined)

    return result
  }).catch(($, e, next) => next(e))

  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    void learnTtl($, e.transcript_path).catch(() => undefined)

    return result
  }).catch(($, e, next) => next(e))

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('context')) {
      const current = await read($, kontext)
      const percent = e.context.percent ?? current.percent
      const fresh = current.isThresholdRead ? { ...current, percent } : await readThreshold($, percent)
      await update($, kontext, () => fresh)
    }

    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const before = (await $.session.usage()).context.tokens
    const result = await next(e)
    const isOurs = e.agentId === undefined && (e.trigger === 'manual' || e.trigger === 'plugin')
    if (result.skip !== undefined || !isOurs) return result

    await update($, isQueued, () => false)
    const k = await readThreshold($, null)
    await update($, kontext, () => k)

    const summary = stripFraming(result.messages.find(m => m.role === 'user')?.text ?? '')
    const tokensBefore = result.tokensBefore ?? before
    // Zusammenfassung als Datei, im Chat nur eine Zeile
    await $.fs.write(`${$.plugin.root}/letzte-zusammenfassung.md`, summary).catch(() => undefined)
    $.clock.after(300, () => {
      $.ui.log(`Compact: ${formatTokens(tokensBefore)} → ${formatTokens(result.tokensAfter)} Tokens`)
    })

    return result
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, lastAt, () => null)
      await update($, hit, () => null)
      await update($, kontext, k => ({ ...k, percent: null }))
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    await read($, tick)
    const [at, cacheTtl, rate, ctx, collapsed, queued] = await Promise.all([
      read($, lastAt), read($, ttl), read($, hit), read($, kontext), read($, isCollapsed), read($, isQueued),
    ])
    const { Box, Button, Text } = $.ui.resolve(e)
    const now = await $.clock.now()

    const minutes = at === null ? null : minutesLeft(at, now, cacheTtl)
    const icon = weather(ctx.percent, ctx.threshold)
    const isStorm = icon === '⛈️'
    const nb = '\u00A0'
    const percent = ctx.percent === null ? '–' : `${ctx.percent}${nb}%`
    const toggle = () =>
      update($, isCollapsed, v => !v).then(async () => $.store.set('isCollapsed', await read($, isCollapsed)))

    const cacheText =
      minutes === null ? 'Cache –' : minutes === 0 ? 'Cache abgelaufen' : `Cache${nb}${minutes}${nb}min`
    const bar = minutes === null ? null : cacheBar(minutes, cacheTtl)
    const threshold = `${ctx.threshold}${nb}%${ctx.isThresholdRead ? '' : '*'}`

    if (collapsed) {
      return (
        <Box flexDirection="row" flexWrap="nowrap" overflow="hidden" gap={1}>
          <Button key="toggle" plain label="▸" onPress={toggle} />
          <Text wrap="truncate-end">{icon}</Text>
          <Text color={bar?.color} wrap="truncate-end">{cacheText}</Text>
          <Text dimColor wrap="truncate-end">·</Text>
          <Text wrap="truncate-end">{percent}</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="row" flexWrap="nowrap" overflow="hidden" alignItems="center" gap={1}>
        <Button key="toggle" plain label="▾" onPress={toggle} />
        <Text color={bar?.color} wrap="truncate-end">{cacheText}</Text>
        {bar !== null && (
          <Text wrap="truncate-end">
            <Text color={bar.color}>{bar.filled}</Text>
            <Text dimColor>{bar.empty}</Text>
          </Text>
        )}
        <Text dimColor wrap="truncate-end">·</Text>
        <Text wrap="truncate-end">Hit{nb}{rate === null ? '–' : `${rate}${nb}%`}</Text>
        <Text dimColor wrap="truncate-end">·</Text>
        <Text wrap="truncate-end">{icon}{nb}{percent}</Text>
        <Text dimColor wrap="truncate-end">/{nb}{threshold}</Text>
        <Box flexGrow={1} />
        <Button
          key="compact"
          label={queued ? 'Compact eingereiht' : 'Compact'}
          variant={isStorm ? 'primary' : 'secondary'}
          onPress={() => void compact($).catch(err => debug($, reason(err)))}
        />
      </Box>
    )
  })
}
