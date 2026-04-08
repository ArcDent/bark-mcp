import type { Config, Plugin } from "@opencode-ai/plugin"

type BarkLevel = "critical" | "active" | "timeSensitive" | "passive"
type BarkConfigSource = Record<string, string | undefined>

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

function loadConfig(values: BarkConfigSource): BarkPluginConfig | null {
  const serverUrl = optionalValue(values.BARK_SERVER_URL)
  const deviceKey = optionalValue(values.BARK_DEVICE_KEY)
  const title = optionalValue(values.BARK_TITLE)

  if (!serverUrl || !deviceKey || !title) {
    return null
  }

  return {
    serverUrl: serverUrl.replace(/\/+$/, ""),
    deviceKey,
    title,
    icon: optionalValue(values.BARK_ICON) ?? optionalValue(values.BARK_ICO_URL),
    url: optionalValue(values.BARK_URL),
    sound: optionalValue(values.BARK_SOUND),
    group: optionalValue(values.BARK_GROUP),
    level: optionalValue(values.BARK_LEVEL) as BarkLevel | undefined,
    isArchive: optionalValue(values.BARK_IS_ARCHIVE),
    autoCopy: optionalValue(values.BARK_AUTO_COPY),
    badge: parseNumber(values.BARK_BADGE),
    timeoutMs: parseNumber(values.BARK_TIMEOUT_MS) ?? 10000,
  }
}

function loadConfigFromOpencode(config: Config): BarkPluginConfig | null {
  const bark = config.mcp?.bark
  if (!bark || typeof bark !== "object" || !("environment" in bark)) {
    return null
  }

  const environment = bark.environment
  if (!environment || typeof environment !== "object") {
    return null
  }

  return loadConfig(
    Object.fromEntries(
      Object.entries(environment).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
  )
}

function firstQuestionLabel(
  questions?: Array<{
    header?: string
    question?: string
  }>,
) {
  if (!questions?.length) return undefined

  return questions
    .map((question) => optionalValue(question.header) ?? optionalValue(question.question))
    .find(Boolean)
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
  let config = loadConfig(process.env)
  let warnedMissingConfig = false
  const sentPermissions = new Set<string>()
  const sentQuestions = new Set<string>()
  const idleSessions = new Set<string>()

  async function logWarn(message: string, extra?: Record<string, unknown>) {
    await client.app.log({
      body: {
        service: "bark-notify",
        level: "warn",
        message,
        extra,
      },
    })
  }

  async function safeNotify(body: string, subtitle?: string) {
    if (!config) {
      if (!warnedMissingConfig) {
        warnedMissingConfig = true
        await logWarn(
          "Bark notification skipped because bark MCP environment is missing from OpenCode config.",
        )
      }
      return
    }

    try {
      await sendBark(config, body, subtitle)
    } catch (error) {
      await logWarn("Failed to send Bark notification", {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    config: async (input) => {
      config = loadConfigFromOpencode(input)
      warnedMissingConfig = false
    },
    event: async ({ event }) => {
      switch (event.type) {
        case "permission.asked": {
          const input = event.properties
          if (sentPermissions.has(input.id)) return
          sentPermissions.add(input.id)
          await safeNotify("OpenCode 需要你的确认。", input.permission)
          return
        }

        case "permission.replied": {
          sentPermissions.delete(event.properties.requestID)
          return
        }

        case "question.asked": {
          const input = event.properties
          if (sentQuestions.has(input.id)) return
          sentQuestions.add(input.id)
          await safeNotify("OpenCode 需要你的回复。", firstQuestionLabel(input.questions))
          return
        }

        case "question.replied":
        case "question.rejected": {
          sentQuestions.delete(event.properties.requestID)
          return
        }

        case "session.status": {
          const input = event.properties
          const type = input.status?.type

          if (type !== "idle") {
            idleSessions.delete(input.sessionID)
            return
          }

          if (idleSessions.has(input.sessionID)) return
          idleSessions.add(input.sessionID)
          await safeNotify("OpenCode 回复已完成。")
          return
        }

        case "session.idle": {
          const input = event.properties
          if (idleSessions.has(input.sessionID)) return
          idleSessions.add(input.sessionID)
          await safeNotify("OpenCode 回复已完成。")
          return
        }
      }
    },
  }
}
