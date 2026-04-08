import { z } from "zod"
import type { BarkConfig } from "./types.js"

const LEVELS = ["critical", "active", "timeSensitive", "passive"] as const

const envSchema = z.object({
  BARK_SERVER_URL: z.string().url(),
  BARK_DEVICE_KEY: z.string().min(1),
  BARK_TITLE: z.string().min(1),
  BARK_URL: z.string().url().optional().or(z.literal("")),
  BARK_ICON: z.string().url().optional().or(z.literal("")),
  BARK_ICO_URL: z.string().url().optional().or(z.literal("")),
  BARK_SOUND: z.string().optional(),
  BARK_GROUP: z.string().optional(),
  BARK_LEVEL: z.enum(LEVELS).optional(),
  BARK_IS_ARCHIVE: z.string().optional(),
  BARK_AUTO_COPY: z.string().optional(),
  BARK_BADGE: z.string().optional(),
  BARK_TIMEOUT_MS: z.string().optional(),
  BARK_CALL: z.string().optional(),
  BARK_IMAGE: z.string().url().optional().or(z.literal("")),
  BARK_COPY: z.string().optional(),
  BARK_ACTION: z.string().optional(),
  BARK_VOLUME: z.string().optional(),
  BARK_CIPHERTEXT: z.string().optional(),
  BARK_TEST_BODY: z.string().optional(),
})

function optionalValue(value?: string) {
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function requiredValue(name: string, value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${name} is required`)
  }
  return trimmed
}

function parseNumber(
  name: string,
  value: string | undefined,
  options?: {
    integer?: boolean
    min?: number
    max?: number
  },
) {
  const normalized = optionalValue(value)
  if (!normalized) return undefined
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a valid number`)
  }
  if (options?.integer && !Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer`)
  }
  if (options?.min !== undefined && parsed < options.min) {
    throw new Error(`${name} must be greater than or equal to ${options.min}`)
  }
  if (options?.max !== undefined && parsed > options.max) {
    throw new Error(`${name} must be less than or equal to ${options.max}`)
  }
  return parsed
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BarkConfig {
  const parsed = envSchema.parse(env)
  const icon = optionalValue(parsed.BARK_ICON) ?? optionalValue(parsed.BARK_ICO_URL)
  const timeoutMs = parseNumber("BARK_TIMEOUT_MS", parsed.BARK_TIMEOUT_MS) ?? 10000

  if (timeoutMs <= 0) {
    throw new Error("BARK_TIMEOUT_MS must be greater than 0")
  }

  return {
    serverUrl: parsed.BARK_SERVER_URL.replace(/\/+$/, ""),
    deviceKey: requiredValue("BARK_DEVICE_KEY", parsed.BARK_DEVICE_KEY),
    title: requiredValue("BARK_TITLE", parsed.BARK_TITLE),
    icon,
    url: optionalValue(parsed.BARK_URL),
    sound: optionalValue(parsed.BARK_SOUND),
    group: optionalValue(parsed.BARK_GROUP),
    level: parsed.BARK_LEVEL,
    isArchive: optionalValue(parsed.BARK_IS_ARCHIVE),
    autoCopy: optionalValue(parsed.BARK_AUTO_COPY),
    badge: parseNumber("BARK_BADGE", parsed.BARK_BADGE, { integer: true }),
    timeoutMs,
    call: optionalValue(parsed.BARK_CALL),
    image: optionalValue(parsed.BARK_IMAGE),
    copy: optionalValue(parsed.BARK_COPY),
    action: optionalValue(parsed.BARK_ACTION),
    volume: parseNumber("BARK_VOLUME", parsed.BARK_VOLUME, {
      integer: true,
      min: 0,
      max: 10,
    }),
    ciphertext: optionalValue(parsed.BARK_CIPHERTEXT),
    testBody:
      optionalValue(parsed.BARK_TEST_BODY) ??
      "Bark MCP test message from OpenCode.",
  }
}
