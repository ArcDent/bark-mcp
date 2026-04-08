export type BarkLevel = "critical" | "active" | "timeSensitive" | "passive"

export interface BarkConfig {
  serverUrl: string
  deviceKey: string
  title: string
  icon?: string
  url?: string
  sound?: string
  group?: string
  level?: BarkLevel
  isArchive?: string
  autoCopy?: string
  badge?: number
  timeoutMs: number
  call?: string
  image?: string
  copy?: string
  action?: string
  volume?: number
  ciphertext?: string
  testBody: string
}

export interface BarkSendInput {
  body?: string
  markdown?: string
  subtitle?: string
  url?: string
  icon?: string
  sound?: string
  group?: string
  level?: BarkLevel
  isArchive?: string
  autoCopy?: string
  badge?: number
  call?: string
  image?: string
  copy?: string
  action?: string
  volume?: number
  ciphertext?: string
  id?: string
  delete?: string
}

export interface BarkResponse {
  code?: number
  message?: string
  timestamp?: number
  [key: string]: unknown
}

export interface BarkSendResult {
  ok: boolean
  status: number
  barkCode?: number
  request: Record<string, unknown>
  response: BarkResponse | string
  error?: string
}
