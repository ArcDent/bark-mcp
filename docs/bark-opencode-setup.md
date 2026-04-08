# Bark MCP 手动接入说明

这份文档面向 **手动接入 OpenCode** 的场景。

本仓库只提供 Bark MCP 本体，不会自动帮你完成以下事情：

- 不会自动注册 MCP
- 不会自动创建 `/bark` 或 `/bark_test`
- 不会自动安装插件

如果你需要这些能力，请按本文档手动配置。

---

## 1. 安装依赖

在 Bark-MCP 仓库根目录执行：

```powershell
npm install
```

---

## 2. 构建并运行测试

```powershell
npm run build
npm test
```

如果这里都没有通过，先不要接入 OpenCode。

---

## 3. 先做 Bark 直连烟雾测试

建议在接入 OpenCode 之前，先直接验证 Bark 服务是否可用。

### 3.1 PowerShell 临时设置必要环境变量

```powershell
$env:BARK_SERVER_URL = "https://your-bark-server.example.com"
$env:BARK_DEVICE_KEY = "your-device-key"
$env:BARK_TITLE = "OpenCode"
```

### 3.2 发送默认测试消息

```powershell
npm run smoke
```

### 3.3 发送自定义测试消息

```powershell
npm run smoke -- "hello from direct bark smoke test"
```

如果这一步失败，请先检查：

- `BARK_SERVER_URL` 是否正确
- `BARK_DEVICE_KEY` 是否正确
- Bark 服务端是否可访问
- 是否有反向代理、证书、网络连通性问题

只有在这一步确认没问题之后，再继续配置 OpenCode。

---

## 4. 在 `opencode.jsonc` 中手动注册 MCP

请在你自己的 OpenCode 项目里编辑 `opencode.jsonc`。

> 注意：下面示例里的 `dist/server.js` 路径只是示意，你需要改成自己本机上 Bark-MCP 的真实路径。

### Windows 示例

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "bark": {
      "type": "local",
      "command": [
        "node",
        "D:/path/to/Bark-MCP/dist/server.js"
      ],
      "enabled": true,
      "timeout": 10000,
      "environment": {
        "BARK_SERVER_URL": "https://your-bark-server.example.com",
        "BARK_DEVICE_KEY": "your-device-key",
        "BARK_TITLE": "OpenCode",
        "BARK_URL": "",
        "BARK_ICO_URL": "https://example.com/icon.png",
        "BARK_SOUND": "",
        "BARK_GROUP": "opencode",
        "BARK_LEVEL": "active",
        "BARK_IS_ARCHIVE": "1",
        "BARK_AUTO_COPY": "",
        "BARK_BADGE": "1",
        "BARK_TIMEOUT_MS": "10000",
        "BARK_TEST_BODY": "Bark MCP test message from OpenCode."
      }
    }
  }
}
```

### macOS / Linux 示例

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "bark": {
      "type": "local",
      "command": [
        "node",
        "/path/to/Bark-MCP/dist/server.js"
      ],
      "enabled": true,
      "timeout": 10000,
      "environment": {
        "BARK_SERVER_URL": "https://your-bark-server.example.com",
        "BARK_DEVICE_KEY": "your-device-key",
        "BARK_TITLE": "OpenCode",
        "BARK_URL": "",
        "BARK_ICO_URL": "https://example.com/icon.png",
        "BARK_SOUND": "",
        "BARK_GROUP": "opencode",
        "BARK_LEVEL": "active",
        "BARK_IS_ARCHIVE": "1",
        "BARK_AUTO_COPY": "",
        "BARK_BADGE": "1",
        "BARK_TIMEOUT_MS": "10000",
        "BARK_TEST_BODY": "Bark MCP test message from OpenCode."
      }
    }
  }
}
```

配置改完后，重启 OpenCode。

---

## 5. `BARK_URL` 应该怎么配

这是本项目最容易让人误解、但也最实用的配置项之一。

### 5.1 它是什么

`BARK_URL` 是 Bark 通知的**默认点击跳转地址**。

当你点开这条通知时，Bark 会尝试打开这个地址。这个地址可以是：

- 普通网页地址：`https://...`
- 你自己的后台地址：`https://ops.example.com/...`
- App 的 URL Scheme：`myapp://...`
- Universal Link：本质上也是一个可访问的 URL

### 5.2 它放在哪里

放在 `opencode.jsonc` 里的 MCP `environment` 中：

```jsonc
"environment": {
  "BARK_URL": "https://example.com/opencode"
}
```

### 5.3 它什么时候生效

本项目里的优先级是：

1. **如果运行时传了 `url`**，优先使用运行时 `url`
2. **如果运行时没传 `url`**，使用配置里的 `BARK_URL`
3. **如果两边都没有**，那通知点击后就没有跳转地址

也就是说，`BARK_URL` 更适合当作“全局默认值”。

### 5.4 最常见的 4 种配置方式

#### 情况 A：不需要跳转

```jsonc
"BARK_URL": ""
```

适合你只想收到提醒，不需要点击后再打开任何页面。

#### 情况 B：所有通知都跳到同一个网页

```jsonc
"BARK_URL": "https://example.com/opencode"
```

适合跳到你的项目主页、知识库、面板页。

#### 情况 C：所有通知都跳到固定后台页面

```jsonc
"BARK_URL": "https://ops.example.com/dashboard/alerts"
```

适合值班、告警、控制台类场景。

#### 情况 D：跳到某个 App

```jsonc
"BARK_URL": "myapp://notice-center"
```

适合你有自己的 App，或者目标应用已经支持 URL Scheme。

### 5.5 推荐实践

如果你现在还不确定要怎么配，建议按下面顺序选择：

1. 最稳妥：先留空

```jsonc
"BARK_URL": ""
```

2. 如果你确实需要点击后打开页面，优先使用标准 `https://...` 地址

3. 只有在你确定客户端能正确处理时，再使用 `myapp://...` 这类自定义 Scheme

### 5.6 需要注意的地方

- `BARK_URL` 不是必填项
- 如果填写，必须是一个合法 URL
- 本项目内部会把它当作默认跳转地址，不会强制每次都覆盖运行时 `url`
- 如果你希望每条消息跳不同地址，那么应该在调用 `bark_send` 时传 `url`，而不是只依赖 `BARK_URL`

---

## 6. 可选：手动添加 `/bark` 与 `/bark_test`

如果你想在 OpenCode 里使用自定义命令，请手动复制以下模板：

- `docs/templates/opencode.commands.bark.md` → 你的项目 `.opencode/commands/bark.md`
- `docs/templates/opencode.commands.bark_test.md` → 你的项目 `.opencode/commands/bark_test.md`

这些模板文件只是示例，仓库不会自动安装。

---

## 7. 可选：手动添加 Bark 自动通知插件

如果你想在以下场景自动推送 Bark：

- OpenCode 需要你确认 / 回答时
- agent 回复完成时

请手动复制：

- `docs/templates/opencode.package.json` → 你的项目 `.opencode/package.json`
- `docs/templates/opencode.plugins.bark-notify.ts` → 你的项目 `.opencode/plugins/bark-notify.ts`

然后在你的 OpenCode 项目里自己执行：

```powershell
bun install --cwd "./.opencode"
```

---

## 8. 推荐接入顺序

建议按这个顺序来：

1. `npm install`
2. `npm run build`
3. `npm test`
4. `npm run smoke`
5. 手动修改 `opencode.jsonc`
6. 重启 OpenCode
7. 按需手动添加 `/bark`、`/bark_test`
8. 按需手动添加自动通知插件

---

## 9. 配置项说明

- `BARK_SERVER_URL`：Bark 服务端地址，不要带 `/push`
- `BARK_DEVICE_KEY`：设备 key
- `BARK_TITLE`：固定通知标题，运行时不能覆盖
- `BARK_URL`：默认点击跳转地址
- `BARK_ICO_URL`：`icon` 的别名，方便配置图标地址
- `BARK_SOUND`：默认铃声
- `BARK_GROUP`：默认分组
- `BARK_LEVEL`：默认中断级别
- `BARK_IS_ARCHIVE`：默认是否归档
- `BARK_AUTO_COPY`：默认是否自动复制
- `BARK_BADGE`：默认角标数字
- `BARK_TIMEOUT_MS`：HTTP 超时时间（毫秒）
- `BARK_TEST_BODY`：`bark_test` 使用的默认测试正文

---

## 10. 额外说明

- `title` 只能来自配置，不能在 `bark_send` 时动态传入
- `BARK_ICO_URL` 在内部会被映射为 Bark 的 `icon`
- 如果 Bark 发送失败，不应该阻塞主流程
- 本仓库故意不包含 live `.opencode` 文件，避免 OpenCode 自动加载后造成干扰
