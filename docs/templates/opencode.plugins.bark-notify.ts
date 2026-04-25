import type { Plugin } from "@opencode-ai/plugin"

type BarkLevel = "critical" | "active" | "timeSensitive" | "passive"
type BarkConfigSource = Record<string, string | undefined>
type NotificationKind = "permission" | "conversationEnd" | "question"

type OpenCodeConfig = {
  mcp?: Record<
    string,
    | {
        environment?: Record<string, string>
      }
    | unknown
  >
}

interface BarkPluginConfig {
  serverUrl: string
  deviceKey: string
  titles: Record<NotificationKind, string>
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

function normalizeInlineText(value?: string) {
  const normalized = optionalValue(value)
  if (!normalized) return undefined
  return normalized.replace(/\s+/g, " ").trim() || undefined
}

function recordValue(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function stringListValue(value: unknown) {
  if (!Array.isArray(value)) return undefined
  const result = value.filter((entry): entry is string => typeof entry === "string")
  return result.length > 0 ? result : undefined
}

function questionListValue(value: unknown) {
  if (!Array.isArray(value)) return undefined

  const questions = value
    .map((entry) => recordValue(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => ({
      header: stringValue(entry.header) ?? stringValue(entry.title),
      question: stringValue(entry.question),
    }))

  return questions.length > 0 ? questions : undefined
}

function textPartValue(value: unknown) {
  const part = recordValue(value)
  if (!part || stringValue(part.type) !== "text") return undefined

  const id = stringValue(part.id)
  const messageID = stringValue(part.messageID)
  const sessionID = stringValue(part.sessionID)
  const text = stringValue(part.text)

  if (!id || !messageID || !sessionID || !text) return undefined

  return {
    id,
    messageID,
    sessionID,
    text,
    ignored: part.ignored === true,
  }
}

type RuntimeEvent = {
  type: string
  properties?: unknown
}

function loadConfig(values: BarkConfigSource): BarkPluginConfig | null {
  const serverUrl = optionalValue(values.BARK_SERVER_URL)
  const deviceKey = optionalValue(values.BARK_DEVICE_KEY)
  const defaultTitle = optionalValue(values.BARK_TITLE)
  const titlePermission = optionalValue(values.BARK_TITLE_PERMISSION) ?? defaultTitle
  const titleConversationEnd =
    optionalValue(values.BARK_TITLE_CONVERSATION_END) ?? defaultTitle
  const titleQuestion = optionalValue(values.BARK_TITLE_QUESTION) ?? defaultTitle

  if (
    !serverUrl ||
    !deviceKey ||
    !titlePermission ||
    !titleConversationEnd ||
    !titleQuestion
  ) {
    return null
  }

  const timeoutMs = parseNumber("BARK_TIMEOUT_MS", values.BARK_TIMEOUT_MS) ?? 10000
  if (timeoutMs <= 0) {
    throw new Error("BARK_TIMEOUT_MS must be greater than 0")
  }

  return {
    serverUrl: serverUrl.replace(/\/+$/, ""),
    deviceKey,
    titles: {
      permission: titlePermission,
      conversationEnd: titleConversationEnd,
      question: titleQuestion,
    },
    icon: optionalValue(values.BARK_ICON) ?? optionalValue(values.BARK_ICO_URL),
    url: optionalValue(values.BARK_URL),
    sound: optionalValue(values.BARK_SOUND),
    group: optionalValue(values.BARK_GROUP),
    level: optionalValue(values.BARK_LEVEL) as BarkLevel | undefined,
    isArchive: optionalValue(values.BARK_IS_ARCHIVE),
    autoCopy: optionalValue(values.BARK_AUTO_COPY),
    badge: parseNumber("BARK_BADGE", values.BARK_BADGE, { integer: true }),
    timeoutMs,
  }
}

function loadConfigFromOpencode(config: OpenCodeConfig): BarkPluginConfig | null {
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

function permissionKey(permission: Record<string, unknown> | undefined) {
  if (!permission) return undefined

  const metadata = recordValue(permission.metadata)

  return (
    optionalValue(stringValue(permission.permission)) ??
    optionalValue(stringValue(permission.type)) ??
    optionalValue(stringValue(metadata?.permission)) ??
    optionalValue(stringValue(metadata?.type))
  )
}

function permissionTranslation(permission: Record<string, unknown> | undefined) {
  const key = permissionKey(permission)
  if (!key) return "请求权限"

  const normalized = key.toLowerCase()
  const translated: Record<string, string> = {
    read: "读取文件",
    edit: "编辑文件",
    write: "写入文件",
    glob: "搜索文件",
    grep: "搜索内容",
    list: "查看目录",
    bash: "执行命令",
    task: "委托子任务",
    todowrite: "更新待办",
    question: "发起提问",
    webfetch: "访问网页",
    websearch: "联网搜索",
    codesearch: "搜索代码",
    external_directory: "访问外部目录",
    lsp: "调用语言服务",
    skill: "加载技能",
    doom_loop: "执行代理循环",
  }

  return translated[normalized] ?? `请求权限（${key}）`
}

function permissionLabel(permission: Record<string, unknown> | undefined) {
  if (!permission) return undefined

  const metadata = recordValue(permission.metadata)
  const metadataTitle = optionalValue(stringValue(metadata?.title))
  const metadataMessage = optionalValue(stringValue(metadata?.message))
  const metadataDescription = optionalValue(stringValue(metadata?.description))
  const key = permissionKey(permission)

  const direct =
    optionalValue(stringValue(permission.title)) ??
    optionalValue(stringValue(permission.message)) ??
    optionalValue(stringValue(permission.description)) ??
    metadataTitle ??
    metadataMessage ??
    metadataDescription

  if (direct) return direct

  const patternValues = stringListValue(permission.pattern) ?? stringListValue(permission.patterns)
  const pattern =
    patternValues
      ?.map((entry) => optionalValue(entry))
      .filter(Boolean)
      .join(", ") ??
    optionalValue(stringValue(permission.pattern)) ??
    optionalValue(stringValue(permission.patterns))

  if (key && pattern) return `${key}: ${pattern}`
  return pattern ?? key
}

function permissionNotificationBody(permission: Record<string, unknown> | undefined) {
  const content = permissionLabel(permission)
  if (!content) return undefined
  return `${permissionTranslation(permission)}|${content}`
}

function previewAssistantReply(value?: string, limit = 100) {
  const normalized = normalizeInlineText(value)
  if (!normalized) return undefined

  const chars = Array.from(normalized)
  if (chars.length <= limit) return normalized
  return `${chars.slice(0, limit).join("")}......`
}

function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  )
}

async function sendBark(
  config: BarkPluginConfig,
  kind: NotificationKind,
  body: string,
  subtitle?: string,
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)

  try {
    const payload = compact({
      device_key: config.deviceKey,
      title: config.titles[kind],
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
  const assistantMessages = new Set<string>()
  const currentAssistantMessageBySession = new Map<string, string>()
  const assistantSessionByMessage = new Map<string, string>()
  const assistantTextPartsByMessage = new Map<string, Map<string, string>>()
  const assistantTextOrderByMessage = new Map<string, string[]>()
  const latestAssistantTextBySession = new Map<string, string>()

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

  function rememberAssistantMessage(messageID: string, sessionID: string) {
    const previousMessageID = currentAssistantMessageBySession.get(sessionID)
    assistantMessages.add(messageID)
    assistantSessionByMessage.set(messageID, sessionID)
    if (previousMessageID === messageID) return

    currentAssistantMessageBySession.set(sessionID, messageID)
    if (previousMessageID) forgetAssistantMessage(previousMessageID)
    latestAssistantTextBySession.delete(sessionID)
    idleSessions.delete(sessionID)
  }

  function forgetAssistantMessage(messageID: string) {
    const sessionID = assistantSessionByMessage.get(messageID)
    assistantMessages.delete(messageID)
    assistantSessionByMessage.delete(messageID)
    assistantTextPartsByMessage.delete(messageID)
    assistantTextOrderByMessage.delete(messageID)
    if (!sessionID) return
    if (currentAssistantMessageBySession.get(sessionID) === messageID) {
      currentAssistantMessageBySession.delete(sessionID)
      latestAssistantTextBySession.delete(sessionID)
    }
  }

  function refreshAssistantPreview(messageID: string) {
    const sessionID = assistantSessionByMessage.get(messageID)
    const parts = assistantTextPartsByMessage.get(messageID)
    const order = assistantTextOrderByMessage.get(messageID)

    if (!sessionID || !parts || !order?.length) {
      if (sessionID) latestAssistantTextBySession.delete(sessionID)
      return
    }

    if (currentAssistantMessageBySession.get(sessionID) !== messageID) return

    const combined = normalizeInlineText(
      order.map((partID) => parts.get(partID) ?? "").join(""),
    )

    if (combined) {
      latestAssistantTextBySession.set(sessionID, combined)
      return
    }

    latestAssistantTextBySession.delete(sessionID)
  }

  function rememberAssistantTextPart(part: {
    id: string
    messageID: string
    sessionID: string
    text: string
    ignored?: boolean
  }) {
    if (!assistantMessages.has(part.messageID) || part.ignored) return
    if (currentAssistantMessageBySession.get(part.sessionID) !== part.messageID) return

    const text = normalizeInlineText(part.text)
    if (!text) return

    let parts = assistantTextPartsByMessage.get(part.messageID)
    if (!parts) {
      parts = new Map<string, string>()
      assistantTextPartsByMessage.set(part.messageID, parts)
    }

    let order = assistantTextOrderByMessage.get(part.messageID)
    if (!order) {
      order = []
      assistantTextOrderByMessage.set(part.messageID, order)
    }

    if (!parts.has(part.id)) order.push(part.id)
    parts.set(part.id, text)
    refreshAssistantPreview(part.messageID)
  }

  function forgetAssistantTextPart(input: {
    sessionID: string
    messageID: string
    partID: string
  }) {
    const parts = assistantTextPartsByMessage.get(input.messageID)
    const order = assistantTextOrderByMessage.get(input.messageID)
    if (!parts || !order) return

    parts.delete(input.partID)
    const nextOrder = order.filter((partID) => partID !== input.partID)

    if (nextOrder.length === 0) {
      assistantTextOrderByMessage.delete(input.messageID)
      assistantTextPartsByMessage.delete(input.messageID)
      if (currentAssistantMessageBySession.get(input.sessionID) === input.messageID) {
        latestAssistantTextBySession.delete(input.sessionID)
      }
      return
    }

    assistantTextOrderByMessage.set(input.messageID, nextOrder)
    refreshAssistantPreview(input.messageID)
  }

  async function safeNotify(
    kind: NotificationKind,
    body?: string,
    subtitle?: string,
  ) {
    if (!config) {
      if (!warnedMissingConfig) {
        warnedMissingConfig = true
        await logWarn(
          "Bark notification skipped because bark MCP environment is missing from OpenCode config.",
        )
      }
      return
    }

    const normalizedBody = normalizeInlineText(body)
    if (!normalizedBody) return

    try {
      await sendBark(config, kind, normalizedBody, subtitle)
    } catch (error) {
      await logWarn("Failed to send Bark notification", {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    config: async (input) => {
      config = loadConfigFromOpencode(input as OpenCodeConfig)
      warnedMissingConfig = false
    },
    event: async ({ event }) => {
      const runtimeEvent = event as RuntimeEvent
      const properties = recordValue(runtimeEvent.properties)

      switch (runtimeEvent.type) {
        case "message.updated": {
          const input = recordValue(properties?.info)
          const id = stringValue(input?.id)
          const sessionID = stringValue(input?.sessionID)
          if (stringValue(input?.role) !== "assistant" || input?.summary === true) return
          if (!id || !sessionID) return
          rememberAssistantMessage(id, sessionID)
          return
        }

        case "message.removed": {
          const messageID = stringValue(properties?.messageID)
          if (messageID) forgetAssistantMessage(messageID)
          return
        }

        case "message.part.updated": {
          const part = textPartValue(properties?.part)
          if (!part) return
          rememberAssistantTextPart(part)
          return
        }

        case "message.part.removed": {
          const sessionID = stringValue(properties?.sessionID)
          const messageID = stringValue(properties?.messageID)
          const partID = stringValue(properties?.partID)
          if (!sessionID || !messageID || !partID) return
          forgetAssistantTextPart({
            sessionID,
            messageID,
            partID,
          })
          return
        }

        case "permission.updated": {
          const input = properties
          const id = stringValue(input?.id)
          const body = permissionNotificationBody(input)
          if (!id || !body || sentPermissions.has(id)) return
          sentPermissions.add(id)
          await safeNotify("permission", body)
          return
        }

        case "permission.asked": {
          const input = properties
          const id = stringValue(input?.id)
          const body = permissionNotificationBody(input)
          if (!id || !body || sentPermissions.has(id)) return
          sentPermissions.add(id)
          await safeNotify("permission", body)
          return
        }

        case "permission.replied": {
          const permissionID =
            optionalValue(stringValue(properties?.permissionID)) ??
            optionalValue(stringValue(properties?.requestID))
          if (permissionID) sentPermissions.delete(permissionID)
          return
        }

        case "question.asked": {
          const id = stringValue(properties?.id)
          const body = firstQuestionLabel(questionListValue(properties?.questions))
          if (!id || !body || sentQuestions.has(id)) return
          sentQuestions.add(id)
          await safeNotify("question", body)
          return
        }

        case "question.replied":
        case "question.rejected": {
          const requestID = stringValue(properties?.requestID)
          if (requestID) sentQuestions.delete(requestID)
          return
        }

        case "session.status": {
          const input = properties
          const sessionID = stringValue(input?.sessionID)
          const type = stringValue(recordValue(input?.status)?.type)
          if (!sessionID) return

          if (type !== "idle") {
            idleSessions.delete(sessionID)
            return
          }

          const body = previewAssistantReply(
            latestAssistantTextBySession.get(sessionID),
          )
          if (!body || idleSessions.has(sessionID)) return
          idleSessions.add(sessionID)
          await safeNotify("conversationEnd", body)
          return
        }

        case "session.idle": {
          const sessionID = stringValue(properties?.sessionID)
          if (!sessionID) return
          const body = previewAssistantReply(
            latestAssistantTextBySession.get(sessionID),
          )
          if (!body || idleSessions.has(sessionID)) return
          idleSessions.add(sessionID)
          await safeNotify("conversationEnd", body)
          return
        }
      }
    },
  }
}
