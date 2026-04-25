import type {
  BarkConfig,
  BarkResponse,
  BarkSendInput,
  BarkSendResult,
} from "./types.js"

function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  )
}

function redactRequest(payload: Record<string, unknown>) {
  const { device_key: _deviceKey, ...safePayload } = payload
  return safePayload
}

function createPayload(config: BarkConfig, input: BarkSendInput) {
  const body = input.markdown?.trim() ? undefined : input.body?.trim()
  const markdown = input.markdown?.trim() || undefined
  const notificationId = input.id?.trim() || undefined
  const deleteFlag = input.delete?.trim() || undefined
  const hasContent = Boolean(body || markdown)

  if (deleteFlag && !notificationId) {
    throw new Error("delete requires id")
  }

  if (!deleteFlag && !hasContent) {
    throw new Error("Either body or markdown is required")
  }

  return compact({
    device_key: config.deviceKey,
    title: hasContent ? config.title : undefined,
    body,
    markdown,
    subtitle: input.subtitle?.trim() || undefined,
    url: input.url ?? config.url,
    icon: input.icon ?? config.icon,
    sound: input.sound ?? config.sound,
    group: input.group ?? config.group,
    level: input.level ?? config.level,
    isArchive: input.isArchive ?? config.isArchive,
    autoCopy: input.autoCopy ?? config.autoCopy,
    badge: input.badge ?? config.badge,
    call: input.call ?? config.call,
    image: input.image ?? config.image,
    copy: input.copy ?? config.copy,
    action: input.action ?? config.action,
    volume: input.volume ?? config.volume,
    ciphertext: input.ciphertext ?? config.ciphertext,
    id: notificationId,
    delete: deleteFlag,
  })
}

function getBarkMetadata(response: BarkResponse | string) {
  if (typeof response === "string") {
    return {
      barkCode: undefined,
      barkMessage: undefined,
    }
  }

  return {
    barkCode: typeof response.code === "number" ? response.code : undefined,
    barkMessage:
      typeof response.message === "string" ? response.message : undefined,
  }
}

export async function sendBark(
  config: BarkConfig,
  input: BarkSendInput,
  fetchImpl: typeof fetch = fetch,
): Promise<BarkSendResult> {
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  let payload: Record<string, unknown> = {}

  try {
    payload = createPayload(config, input)
    timeout = setTimeout(() => controller.abort(), config.timeoutMs)
    const response = await fetchImpl(`${config.serverUrl}/push`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    const raw = await response.text()
    let parsed: string | Record<string, unknown>

    try {
      parsed = JSON.parse(raw) as Record<string, unknown>
    } catch {
      parsed = raw
    }

    const { barkCode, barkMessage } = getBarkMetadata(parsed)
    const ok = response.ok && (barkCode === undefined || barkCode === 200)
    const error = ok
      ? undefined
      : barkMessage ??
        (response.ok
          ? barkCode !== undefined
            ? `Bark request failed with code ${barkCode}`
            : "Bark request failed"
          : `HTTP ${response.status}`)

    return {
      ok,
      status: response.status,
      barkCode,
      request: redactRequest(payload),
      response: parsed,
      error,
    }
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `Request timed out after ${config.timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error)

    return {
      ok: false,
      status: 0,
      request: redactRequest(payload),
      response: message,
      error: message,
    }
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}

export function createTestInput(config: BarkConfig): BarkSendInput {
  return {
    body: config.testBody,
  }
}
