export type CacheTtl = '5m' | '1h'

export type Kontext = {
  percent: number | null
  threshold: number
  isThresholdRead: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'nf-cache-context': {
      lastAt: number | null
      ttl: CacheTtl
      hitRate: number | null
      kontext: Kontext
      tick: number
      isCollapsed: boolean
      isQueued: boolean
      isBusy: boolean
    }
  }
}
