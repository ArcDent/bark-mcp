import type { Plugin } from "@opencode-ai/plugin"

type BarkLevel = "critical" | "active" | "timeSensitive" | "passive"

interface BarkPluginConfig {
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
}

function optionalValue(value?: string) {
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function parseNumber(value?: string) {
  const normalized = optionalValue(value)
  if (!normalized) return undefined
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

function loadConfig(env: NodeJS.ProcessEnv): BarkPluginConfig | null {
  const serverUrl = optionalValue(env.BARK_SERVER_URL)
  const deviceKey = optionalValue(env.BARK_DEVICE_KEY)
  const title = optionalValue(env.BARK_TITLE)

  if (!serverUrl || !deviceKey || !title) {
    return null
  }

  return {
    serverUrl: serverUrl.replace(/\/+$/, ""),
    deviceKey,
    title,
    icon: optionalValue(env.BARK_ICON) ?? optionalValue(env.BARK_ICO_URL),
    url: optionalValue(env.BARK_URL),
    sound: optionalValue(env.BARK_SOUND),
    group: optionalValue(env.BARK_GROUP),
    level: optionalValue(env.BARK_LEVEL) as BarkLevel | undefined,
    isArchive: optionalValue(env.BARK_IS_ARCHIVE),
    autoCopy: optionalValue(env.BARK_AUTO_COPY),
    badge: parseNumber(env.BARK_BADGE),
    timeoutMs: parseNumber(env.BARK_TIMEOUT_MS) ?? 10000,
  }
}

function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  )
}

async function sendBark(config: BarkPluginConfig, body: string, subtitle?: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)

  try {
    const payload = compact({
      device_key: config.deviceKey,
      title: config.title,
      body,
      subtitle,
      icon: config.icon,
      url: config.url,
      sound: config.sound,
      group: config.group,
      level: config.level,
      isArchive: config.isArchive,
      autoCopy: config.autoCopy,
      badge: config.badge,
    })

    await fetch(`${config.serverUrl}/push`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

export const BarkNotifyPlugin: Plugin = async ({ client }) => {
  const config = loadConfig(process.env)
  const sentPermissions = new Set<string>()
  const idleSessions = new Set<string>()

  async function safeNotify(body: string, subtitle?: string) {
    if (!config) return

    try {
      await sendBark(config, body, subtitle)
    } catch (error) {
      await client.app.log({
        body: {
          service: "bark-notify",
          level: "warn",
          message: "Failed to send Bark notification",
          extra: {
            error: error instanceof Error ? error.message : String(error),
          },
        },
      })
    }
  }

  return {
    "permission.asked": async (input) => {
      const key = [input.sessionID, input.permission, JSON.stringify(input.patterns ?? [])].join(":")
      if (sentPermissions.has(key)) return
      sentPermissions.add(key)
      await safeNotify("OpenCode needs your confirmation.", input.permission)
    },
    "permission.replied": async (input) => {
      const prefix = `${input.sessionID}:`
      for (const key of [...sentPermissions]) {
        if (key.startsWith(prefix)) sentPermissions.delete(key)
      }
    },
    "session.status": async (input) => {
      const type = input.status?.type
      if (type === "busy") {
        idleSessions.delete(input.sessionID)
        return
      }

      if (type === "idle") {
        if (idleSessions.has(input.sessionID)) return
        idleSessions.add(input.sessionID)
        await safeNotify("OpenCode reply is complete.")
      }
    },
  }
}
