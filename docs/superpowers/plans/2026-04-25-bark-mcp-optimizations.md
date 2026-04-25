# Bark MCP Optimizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Bark MCP validation, error handling, template consistency, CI, and documentation without changing the project scope or adding live `.opencode` files.

**Architecture:** Keep the MCP runtime small: `src/server.ts` owns MCP tool metadata/input schemas, `src/config.ts` owns environment validation, and `src/bark.ts` owns Bark payload/result handling. Tests stay in `test/bark.test.ts`; optional OpenCode plugin template checks use a lightweight generated declaration build config that never turns templates into runtime repo config.

**Tech Stack:** TypeScript ESM/NodeNext, Zod, MCP SDK, Vitest, Node built-in `fetch`/`Response`, GitHub Actions.

---

## File Structure

- Modify `src/server.ts`: correct MCP tool descriptions and require integer runtime `volume` values.
- Modify `src/bark.ts`: redact `device_key` from returned request snapshots while preserving real outbound Bark payloads.
- Modify `test/bark.test.ts`: add regression tests for config validation, response parsing, timeout handling, request redaction, and server schema source text.
- Modify `docs/templates/opencode.plugins.bark-notify.ts`: align duplicated template numeric parsing with `src/config.ts` for integer badge and positive timeout.
- Add `docs/templates/tsconfig.json`: type-check only the plugin template with no emitted JavaScript.
- Modify `package.json`: add `check:templates` and include it in the test workflow.
- Add `.github/workflows/ci.yml`: run install, type-check, tests, template type-check, and build on PR/push.
- Modify `README.md`: add update notes after implementation is complete.

---

## Task 1: MCP schema and description corrections

**Files:**
- Modify: `src/server.ts`
- Test: `test/bark.test.ts`

- [ ] **Step 1: Write failing server metadata/schema tests**

Add these imports and tests to `test/bark.test.ts`:

```ts
import { readFileSync } from "node:fs"
import { join } from "node:path"

function projectFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8")
}

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
```

- [ ] **Step 2: Run RED check**

Run: `npm test -- test/bark.test.ts`

Expected: FAIL because `src/server.ts` still contains the old descriptions and `volume` lacks `.int()`.

- [ ] **Step 3: Implement minimal server changes**

In `src/server.ts`, change:

```ts
volume: z.number().min(0).max(10).optional(),
```

to:

```ts
volume: z.number().int().min(0).max(10).optional(),
```

Change `bark_send` description to:

```ts
"Send a Bark notification. Title is fixed from config; subtitle can be supplied per request."
```

Change `bark_test` description to:

```ts
"Send a Bark test notification using config defaults."
```

- [ ] **Step 4: Run GREEN/self-check**

Run: `npm test -- test/bark.test.ts`

Expected: PASS for `test/bark.test.ts`.

Run: `npm run check`

Expected: TypeScript exits 0.

---

## Task 2: Config validation regression tests

**Files:**
- Modify: `test/bark.test.ts`

- [ ] **Step 1: Write failing or coverage-expanding config tests**

Add these tests inside `describe("loadConfig", ...)` in `test/bark.test.ts`:

```ts
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
```

- [ ] **Step 2: Run coverage self-check**

Run: `npm test -- test/bark.test.ts`

Expected: PASS. These tests document existing source behavior; if any fail, inspect `src/config.ts` and fix only the mismatch between code and documented repository rules.

---

## Task 3: HTTP, non-JSON, and timeout behavior tests

**Files:**
- Modify: `test/bark.test.ts`

- [ ] **Step 1: Add response/timeout regression tests**

Add these tests inside `describe("sendBark", ...)` in `test/bark.test.ts`:

```ts
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

    vi.useRealTimers()
  })
```

- [ ] **Step 2: Run self-check**

Run: `npm test -- test/bark.test.ts`

Expected: PASS. If the timeout test leaves fake timers active on failure, restore real timers in an `afterEach` hook.

---

## Task 4: Redact device keys from returned request snapshots

**Files:**
- Modify: `src/bark.ts`
- Modify: `test/bark.test.ts`

- [ ] **Step 1: Write failing redaction expectations**

In `test/bark.test.ts`, update the existing `"preserves the request payload on transport failure"` test to expect no secret in `result.request`:

```ts
    expect(result.request).toMatchObject({
      title: "Fixed Title",
      body: "hello world",
      group: "opencode",
    })
    expect(result.request).not.toHaveProperty("device_key")
```

Add the same redaction assertion to the successful send test:

```ts
    expect(result.request).toMatchObject({
      title: "Fixed Title",
      body: "hello world",
    })
    expect(result.request).not.toHaveProperty("device_key")
```

Keep the fetch body assertion that verifies Bark still receives the real `device_key`.

- [ ] **Step 2: Run RED check**

Run: `npm test -- test/bark.test.ts`

Expected: FAIL because `result.request` still contains `device_key`.

- [ ] **Step 3: Implement redaction helper**

In `src/bark.ts`, add after `compact`:

```ts
function redactRequest(payload: Record<string, unknown>) {
  const { device_key: _deviceKey, ...safePayload } = payload
  return safePayload
}
```

Change both returned `request: payload` entries to:

```ts
request: redactRequest(payload),
```

- [ ] **Step 4: Run GREEN/self-check**

Run: `npm test -- test/bark.test.ts`

Expected: PASS.

Run: `npm run check`

Expected: TypeScript exits 0.

---

## Task 5: Align plugin template validation and add template type-checking

**Files:**
- Modify: `docs/templates/opencode.plugins.bark-notify.ts`
- Add: `docs/templates/tsconfig.json`
- Modify: `package.json`

- [ ] **Step 1: Write template type-check configuration and script**

Create `docs/templates/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": ".",
    "outDir": "../../dist/templates",
    "types": ["node"]
  },
  "include": ["opencode.plugins.bark-notify.ts"]
}
```

In `package.json`, add:

```json
"check:templates": "tsc -p docs/templates/tsconfig.json --noEmit"
```

and change test script to:

```json
"test": "vitest run && npm run check:templates"
```

- [ ] **Step 2: Run type-check RED/GREEN baseline**

Run: `npm run check:templates`

Expected: PASS before behavior edits; this establishes the template can be type-checked.

- [ ] **Step 3: Align template numeric parsing with runtime config**

Replace `parseNumber(value?: string)` in `docs/templates/opencode.plugins.bark-notify.ts` with:

```ts
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
```

In `loadConfig`, compute timeout before `return`:

```ts
  const timeoutMs = parseNumber("BARK_TIMEOUT_MS", values.BARK_TIMEOUT_MS) ?? 10000
  if (timeoutMs <= 0) {
    throw new Error("BARK_TIMEOUT_MS must be greater than 0")
  }
```

Change returned numeric fields to:

```ts
    badge: parseNumber("BARK_BADGE", values.BARK_BADGE, { integer: true }),
    timeoutMs,
```

- [ ] **Step 4: Run self-check**

Run: `npm run check:templates`

Expected: PASS.

Run: `npm test -- test/bark.test.ts`

Expected: PASS and template type-check runs through the `npm test` script when invoked without a file filter.

---

## Task 6: Add minimal CI

**Files:**
- Add: `.github/workflows/ci.yml`

- [ ] **Step 1: Add GitHub Actions workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [master, ArcDev]
  pull_request:
    branches: [master]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Type-check runtime
        run: npm run check

      - name: Run tests
        run: npm test

      - name: Build
        run: npm run build
```

- [ ] **Step 2: Run local CI equivalent**

Run: `npm run check && npm test && npm run build`

Expected: All commands exit 0. Do not run `npm run smoke` unless real Bark credentials are intentionally provided.

---

## Task 7: README update notes

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add update summary**

Add a section before `## 手动接入说明`:

```md
## 本次更新

- MCP 工具描述更准确：`title` 始终来自配置，`subtitle` 可在运行时传入。
- 运行时 `volume` 与环境变量校验保持一致，均要求整数且范围为 `0-10`。
- `sendBark` 返回的请求快照会隐藏 `device_key`，但实际发送给 Bark 的请求仍包含设备密钥。
- 测试覆盖新增配置边界、HTTP/非 JSON 响应、超时错误与请求脱敏场景。
- `docs/templates/opencode.plugins.bark-notify.ts` 与主配置的数字校验规则保持一致，并新增模板类型检查。
- 新增 GitHub Actions CI，自动执行安装、类型检查、测试与构建。
```

- [ ] **Step 2: Run documentation self-check**

Run: `npm run check && npm test`

Expected: Both commands exit 0; README-only changes should not affect runtime checks.

---

## Task 8: Final verification, commit, push, and PR

**Files:**
- All modified files

- [ ] **Step 1: Verify branch freshness**

Run: `git fetch origin master && git rev-list --left-right --count HEAD...origin/master`

Expected: second number is `0`, meaning `ArcDev` is not behind `origin/master`. If behind, run `git rebase origin/master`, resolve conflicts, then re-run all verification.

- [ ] **Step 2: Run final verification**

Run: `npm run check && npm test && npm run build`

Expected: All commands exit 0.

- [ ] **Step 3: Inspect changes**

Run: `git status --short` and `git diff --check`

Expected: Only intended files changed; `git diff --check` exits 0.

- [ ] **Step 4: Commit**

Run:

```bash
git add src/server.ts src/bark.ts test/bark.test.ts docs/templates/opencode.plugins.bark-notify.ts docs/templates/tsconfig.json package.json package-lock.json .github/workflows/ci.yml README.md docs/superpowers/plans/2026-04-25-bark-mcp-optimizations.md
git commit -m "chore: harden bark mcp validation and ci"
```

- [ ] **Step 5: Push branch**

Run: `git push -u origin ArcDev`

- [ ] **Step 6: Create PR**

Run:

```bash
gh pr create --base master --head ArcDev --title "Harden Bark MCP validation and CI" --body "$(cat <<'EOF'
## Summary
- tighten MCP input metadata, validation, and request redaction
- expand config/sendBark coverage and type-check the OpenCode plugin template
- add CI plus README update notes

## Verification
- npm run check
- npm test
- npm run build
EOF
)"
```

Expected: PR URL is returned.

---

## Plan Self-Review

- Spec coverage: all 10 accepted optimization points are mapped to tasks: server descriptions/schema (Task 1), config tests (Task 2), HTTP/non-JSON/timeout tests (Task 3), request redaction (Task 4), template validation/type-checking (Task 5), fixed dependency/test environment through clean clone/install and CI (Tasks 5-8), CI (Task 6), README update (Task 7), branch/PR flow (Task 8).
- Placeholder scan: no TBD/TODO placeholders; each code-changing task includes exact file paths, code snippets, commands, and expected results.
- Type consistency: names match existing project APIs (`loadConfig`, `sendBark`, `createTestInput`, `BarkPluginConfig`, `BARK_TIMEOUT_MS`, `device_key`) and NodeNext import rules remain unchanged.
- Scope check: plan does not add live `.opencode` files or auto-install OpenCode integrations; template work stays under `docs/templates/`.
