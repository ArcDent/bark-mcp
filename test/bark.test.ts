import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { createTestInput, sendBark } from "../src/bark.js"
import { loadConfig } from "../src/config.js"

function projectFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8")
}

describe("loadConfig", () => {
  it("maps ico_url into icon and keeps fixed title", () => {
    const config = loadConfig({
      BARK_SERVER_URL: "https://bark.example.com",
      BARK_DEVICE_KEY: "device-key",
      BARK_TITLE: "OpenCode",
      BARK_ICO_URL: "https://example.com/icon.png",
    })

    expect(config.icon).toBe("https://example.com/icon.png")
    expect(config.title).toBe("OpenCode")
  })

  it("trims required string values and validates numeric constraints", () => {
    const config = loadConfig({
      BARK_SERVER_URL: "https://bark.example.com",
      BARK_DEVICE_KEY: "  device-key  ",
      BARK_TITLE: "  OpenCode  ",
      BARK_BADGE: "2",
      BARK_VOLUME: "7",
    })

    expect(config.deviceKey).toBe("device-key")
    expect(config.title).toBe("OpenCode")
    expect(config.badge).toBe(2)
    expect(config.volume).toBe(7)
  })

  it("prefers BARK_ICON over BARK_ICO_URL", () => {
    const config = loadConfig({
      BARK_SERVER_URL: "https://bark.example.com",
      BARK_DEVICE_KEY: "device-key",
      BARK_TITLE: "OpenCode",
      BARK_ICON: "https://example.com/icon.png",
      BARK_ICO_URL: "https://example.com/legacy-icon.png",
    })

    expect(config.icon).toBe("https://example.com/icon.png")
  })

  it("rejects non-integer badge values", () => {
    expect(() =>
      loadConfig({
        BARK_SERVER_URL: "https://bark.example.com",
        BARK_DEVICE_KEY: "device-key",
        BARK_TITLE: "OpenCode",
        BARK_BADGE: "1.5",
      }),
    ).toThrow("BARK_BADGE must be an integer")
  })

  it("rejects fractional and out-of-range volume values", () => {
    const base = {
      BARK_SERVER_URL: "https://bark.example.com",
      BARK_DEVICE_KEY: "device-key",
      BARK_TITLE: "OpenCode",
    }

    expect(() => loadConfig({ ...base, BARK_VOLUME: "1.5" })).toThrow(
      "BARK_VOLUME must be an integer",
    )
    expect(() => loadConfig({ ...base, BARK_VOLUME: "-1" })).toThrow(
      "BARK_VOLUME must be greater than or equal to 0",
    )
    expect(() => loadConfig({ ...base, BARK_VOLUME: "11" })).toThrow(
      "BARK_VOLUME must be less than or equal to 10",
    )
  })

  it("rejects non-positive timeout values", () => {
    expect(() =>
      loadConfig({
        BARK_SERVER_URL: "https://bark.example.com",
        BARK_DEVICE_KEY: "device-key",
        BARK_TITLE: "OpenCode",
        BARK_TIMEOUT_MS: "0",
      }),
    ).toThrow("BARK_TIMEOUT_MS must be greater than 0")
  })
})

describe("sendBark", () => {
  it("sends JSON payload with config title only", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ code: 200, message: "success" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    })

    const config = loadConfig({
      BARK_SERVER_URL: "https://bark.example.com",
      BARK_DEVICE_KEY: "device-key",
      BARK_TITLE: "Fixed Title",
    })

    const result = await sendBark(config, { body: "hello world" }, fetchMock as typeof fetch)

    expect(result.ok).toBe(true)
    expect(result.barkCode).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://bark.example.com/push")
    expect(JSON.parse(String(init.body))).toMatchObject({
      title: "Fixed Title",
      body: "hello world",
      device_key: "device-key",
    })
    expect(JSON.parse(String(init.body))).not.toHaveProperty("ico_url")
    expect(result.request).toMatchObject({
      title: "Fixed Title",
      body: "hello world",
    })
    expect(result.request).not.toHaveProperty("device_key")
  })

  it("prefers markdown over body in the outgoing payload", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ code: 200, message: "success" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    })

    const config = loadConfig({
      BARK_SERVER_URL: "https://bark.example.com",
      BARK_DEVICE_KEY: "device-key",
      BARK_TITLE: "Fixed Title",
    })

    await sendBark(
      config,
      { body: "plain body", markdown: "# markdown body" },
      fetchMock as typeof fetch,
    )

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({
      title: "Fixed Title",
      markdown: "# markdown body",
    })
    expect(JSON.parse(String(init.body))).not.toHaveProperty("body")
  })

  it("treats Bark JSON error code as a failed send", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ code: 500, message: "invalid device key" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    })

    const config = loadConfig({
      BARK_SERVER_URL: "https://bark.example.com",
      BARK_DEVICE_KEY: "device-key",
      BARK_TITLE: "Fixed Title",
    })

    const result = await sendBark(config, { body: "hello world" }, fetchMock as typeof fetch)

    expect(result.ok).toBe(false)
    expect(result.status).toBe(200)
    expect(result.barkCode).toBe(500)
    expect(result.error).toBe("invalid device key")
  })

  it("returns HTTP status errors for non-2xx responses", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ message: "server error" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      })
    })

    const config = loadConfig({
      BARK_SERVER_URL: "https://bark.example.com",
      BARK_DEVICE_KEY: "device-key",
      BARK_TITLE: "Fixed Title",
    })

    const result = await sendBark(config, { body: "hello world" }, fetchMock as typeof fetch)

    expect(result.ok).toBe(false)
    expect(result.status).toBe(500)
    expect(result.error).toBe("server error")
  })

  it("accepts successful plain text Bark responses", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response("ok", {
        status: 200,
        headers: { "content-type": "text/plain" },
      })
    })

    const config = loadConfig({
      BARK_SERVER_URL: "https://bark.example.com",
      BARK_DEVICE_KEY: "device-key",
      BARK_TITLE: "Fixed Title",
    })

    const result = await sendBark(config, { body: "hello world" }, fetchMock as typeof fetch)

    expect(result.ok).toBe(true)
    expect(result.barkCode).toBeUndefined()
    expect(result.response).toBe("ok")
  })

  it("accepts JSON Bark responses without a code field", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ message: "accepted" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    })

    const config = loadConfig({
      BARK_SERVER_URL: "https://bark.example.com",
      BARK_DEVICE_KEY: "device-key",
      BARK_TITLE: "Fixed Title",
    })

    const result = await sendBark(config, { body: "hello world" }, fetchMock as typeof fetch)

    expect(result.ok).toBe(true)
    expect(result.barkCode).toBeUndefined()
    expect(result.response).toEqual({ message: "accepted" })
  })

  it("returns a structured timeout error", async () => {
    vi.useFakeTimers()

    try {
      const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"))
          })
        })
      })

      const config = loadConfig({
        BARK_SERVER_URL: "https://bark.example.com",
        BARK_DEVICE_KEY: "device-key",
        BARK_TITLE: "Fixed Title",
        BARK_TIMEOUT_MS: "25",
      })

      const resultPromise = sendBark(config, { body: "hello world" }, fetchMock as typeof fetch)
      await vi.advanceTimersByTimeAsync(25)
      const result = await resultPromise

      expect(result.ok).toBe(false)
      expect(result.status).toBe(0)
      expect(result.error).toBe("Request timed out after 25ms")
    } finally {
      vi.useRealTimers()
    }
  })

  it("preserves the request payload on transport failure", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("socket hang up")
    })

    const config = loadConfig({
      BARK_SERVER_URL: "https://bark.example.com",
      BARK_DEVICE_KEY: "device-key",
      BARK_TITLE: "Fixed Title",
      BARK_GROUP: "opencode",
    })

    const result = await sendBark(config, { body: "hello world" }, fetchMock as typeof fetch)

    expect(result.ok).toBe(false)
    expect(result.status).toBe(0)
    expect(result.error).toBe("socket hang up")
    expect(result.request).toMatchObject({
      title: "Fixed Title",
      body: "hello world",
      group: "opencode",
    })
    expect(result.request).not.toHaveProperty("device_key")
  })

  it("returns a structured error for missing content", async () => {
    const config = loadConfig({
      BARK_SERVER_URL: "https://bark.example.com",
      BARK_DEVICE_KEY: "device-key",
      BARK_TITLE: "Fixed Title",
    })

    const result = await sendBark(config, {})

    expect(result.ok).toBe(false)
    expect(result.status).toBe(0)
    expect(result.response).toBe("Either body or markdown is required")
    expect(result.error).toBe("Either body or markdown is required")
  })

  it("returns a structured error when delete is sent without id", async () => {
    const config = loadConfig({
      BARK_SERVER_URL: "https://bark.example.com",
      BARK_DEVICE_KEY: "device-key",
      BARK_TITLE: "Fixed Title",
    })

    const result = await sendBark(config, {
      body: "delete request",
      delete: "1",
    })

    expect(result.ok).toBe(false)
    expect(result.status).toBe(0)
    expect(result.response).toBe("delete requires id")
    expect(result.error).toBe("delete requires id")
  })

  it("allows delete requests with id and no message body", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ code: 200, message: "success" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    })

    const config = loadConfig({
      BARK_SERVER_URL: "https://bark.example.com",
      BARK_DEVICE_KEY: "device-key",
      BARK_TITLE: "Fixed Title",
    })

    const result = await sendBark(
      config,
      { id: "notification-1", delete: "1" },
      fetchMock as typeof fetch,
    )

    expect(result.ok).toBe(true)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      device_key: "device-key",
      id: "notification-1",
      delete: "1",
    })
  })

  it("creates a fixed test message", () => {
    const config = loadConfig({
      BARK_SERVER_URL: "https://bark.example.com",
      BARK_DEVICE_KEY: "device-key",
      BARK_TITLE: "Fixed Title",
    })

    expect(createTestInput(config)).toEqual({
      body: "Bark MCP test message from OpenCode.",
    })
  })
})

describe("server tool definitions", () => {
  it("documents fixed titles without claiming subtitles are fixed", () => {
    const source = projectFile("src/server.ts")

    expect(source).toContain(
      "Send a Bark notification. Title is fixed from config; subtitle can be supplied per request.",
    )
    expect(source).toContain(
      "Send a Bark test notification using config defaults.",
    )
    expect(source).not.toContain("defaults.Title")
    expect(source).not.toContain("Title and subtitle is fixed")
  })

  it("requires runtime volume values to be integers", () => {
    const source = projectFile("src/server.ts")

    expect(source).toContain("volume: z.number().int().min(0).max(10).optional()")
  })
})
