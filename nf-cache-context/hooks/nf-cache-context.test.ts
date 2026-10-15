import { expect, mock, test } from 'claude-code/testing'

import { cacheBar, chunkText, detectTtl, hitRate, minutesLeft, weather } from './logic'

test('Cache-Restzeit zählt ab der letzten Antwort herunter', () => {
  expect(minutesLeft(0, 0, '5m')).toBe(5)
  expect(minutesLeft(0, 61_000, '5m')).toBe(4)
  expect(minutesLeft(0, 300_000, '5m')).toBe(0)
  expect(minutesLeft(0, 30 * 60_000, '1h')).toBe(30)
})

test('Balken: 20 Kästchen, grün, gelb im letzten Viertel, rot in den letzten 10 %', () => {
  const full = cacheBar(60, '1h')
  expect(full.filled.length + full.empty.length).toBe(20)
  expect(full.color).toBe('success')
  expect(cacheBar(15, '1h').color).toBe('warning')
  expect(cacheBar(6, '1h').color).toBe('error')
  expect(cacheBar(0, '5m').filled).toBe('')
})

test('Hit-Rate und Wetter', () => {
  expect(hitRate({ input_tokens: 10, cache_read_input_tokens: 90, cache_creation_input_tokens: 0 })).toBe(90)
  expect(weather(40, 83)).toBe('☀️')
  expect(weather(60, 83)).toBe('🌧️')
  expect(weather(70, 83)).toBe('⛈️')
})

test('TTL wird aus dem Transkript erkannt', () => {
  const line = (m5: number, h1: number) =>
    `{"cache_creation":{"ephemeral_5m_input_tokens":${m5},"ephemeral_1h_input_tokens":${h1}}}`
  expect(detectTtl(line(0, 500) + '\n' + line(0, 0))).toBe('1h')
  expect(detectTtl(line(400, 0))).toBe('5m')
  expect(detectTtl('nichts')).toBe(null)
})

test('Lange Zusammenfassungen werden an Absätzen geteilt', () => {
  const para = 'x'.repeat(1000)
  const chunks = chunkText([para, para, para].join('\n\n'))
  expect(chunks.length).toBe(3)
  expect(chunks.every(c => c.length <= 1800)).toBe(true)
  expect(chunkText('a\n\nb')).toEqual(['a\n\nb'])
})

test('Leiste zeichnet sich ohne Antwort und lässt sich zuklappen', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'nf-cache-context',
      surface,
      component: 'AbovePrompt',
      props: {
        hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120,
        scroll: { offset: 0, bodyRows: 9 }, view: {},
      },
    } as never)
    expect(await ui.find({ type: 'Text', text: /Hit/ })).toBeDefined()
    expect(await ui.find({ key: 'compact' })).toBeDefined()
    await ui.press({ key: 'toggle' })
    expect(await ui.find({ key: 'compact' })).toBeUndefined()
    await ui.press({ key: 'toggle' })
    await ui.unmount()
  }
})
