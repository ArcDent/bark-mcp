# Bark MCP（适用于 OpenCode）

这是一个本地运行的 Bark MCP 服务，用来把通知发送到你已经部署好的 Bark 服务端。

它的设计目标很明确：

- 只提供 **Bark MCP 本体**
- **不会**自动接入 OpenCode
- **不会**自动生成 `.opencode/commands` 或 `.opencode/plugins`
- 最后的 MCP、命令、插件对接，全部由你自己手动配置

## 功能特点

- 通过 Bark 官方推荐的 `POST /push` JSON 接口发送通知
- `title` 只能来自配置，不能在运行时被工具调用覆盖
- 支持 `BARK_ICO_URL` 作为 `icon` 的友好别名
- 提供 `bark_send` 与 `bark_test` 两个 MCP 工具
- 提供独立的 `smoke` 命令，方便你在接 OpenCode 之前先直连测试 Bark
- 可选 OpenCode 插件模板支持 3 类固定标题：权限请求、提出问题、会话完成
- 可选 OpenCode 插件模板支持动态通知正文：`权限类型翻译|权限申请内容`、问题标题、最长 100 字回复预览

## 目录说明

- `src/`：MCP 服务端、配置解析、Bark 请求发送逻辑
- `test/`：Vitest 测试
- `docs/bark-opencode-setup.md`：中文手动接入说明
- `docs/templates/`：可选模板文件，供你手动复制到自己的 OpenCode 项目中

## 快速开始

在仓库根目录执行：

```powershell
npm install
npm run build
npm test
```

如果你想先不接 OpenCode，只验证 Bark 链路是否畅通：

```powershell
$env:BARK_SERVER_URL = "https://your-bark-server.example.com"
$env:BARK_DEVICE_KEY = "your-device-key"
$env:BARK_TITLE = "OpenCode"

npm run smoke
```

更完整的手动接入方式见：

- `docs/bark-opencode-setup.md`

## `BARK_URL` 配置重点

`BARK_URL` 是一个**默认点击跳转地址**。

它的作用是：当用户点击 Bark 通知时，Bark 会尝试打开这个地址。

### 什么时候该配置 `BARK_URL`

适合以下场景：

- 你希望所有通过 Bark MCP 发出的通知，都默认跳到同一个网页
- 你希望通知点击后打开某个固定的后台页面、知识库页面或 Web 控制台
- 你希望点击通知后唤起某个 App 的 URL Scheme / Universal Link

### `BARK_URL` 的生效规则

1. 如果 MCP 调用时**没有传入**运行时参数 `url`，就使用配置里的 `BARK_URL`
2. 如果 MCP 调用时**传入了**运行时参数 `url`，那么运行时的 `url` 会覆盖 `BARK_URL`
3. 如果 `BARK_URL` 为空，且运行时也没有传入 `url`，那么通知点击后就**没有默认跳转地址**

### 推荐写法

#### 1）不需要默认跳转

```jsonc
"BARK_URL": ""
```

#### 2）跳转到网页

```jsonc
"BARK_URL": "https://example.com/opencode"
```

#### 3）跳转到你自己的后台或面板

```jsonc
"BARK_URL": "https://ops.example.com/dashboard/alerts"
```

#### 4）跳转到 App Scheme / Universal Link

```jsonc
"BARK_URL": "myapp://notice-center"
```

> 建议优先使用 `https://...`。如果你要使用 App Scheme，也请确保它本身是一个合法 URL，并且目标 App 已正确支持该 Scheme。

## 重要约束

- `title` 是配置项，不允许在 `bark_send` 里动态覆盖
- `BARK_TITLE` 仍然是 MCP 本体与插件模板的默认固定标题
- 如果你使用 `docs/templates/opencode.plugins.bark-notify.ts`，还可以额外配置：
  - `BARK_TITLE_PERMISSION`
  - `BARK_TITLE_QUESTION`
  - `BARK_TITLE_CONVERSATION_END`
- 上述 3 个插件标题如果未设置，会自动回退到 `BARK_TITLE`
- 仓库里不包含任何会被 OpenCode 自动加载的 live `.opencode` 文件
- `docs/templates/` 里的内容只是模板，只有你手动复制后才会生效

## 本次更新

- MCP 工具描述更准确：`title` 始终来自配置，`subtitle` 可在运行时传入。
- 运行时 `volume` 与环境变量校验保持一致，均要求整数且范围为 `0-10`。
- `sendBark` 返回的请求快照会隐藏 `device_key`，但实际发送给 Bark 的请求仍包含设备密钥。
- 测试覆盖新增配置边界、HTTP/非 JSON 响应、超时错误与请求脱敏场景。
- `docs/templates/opencode.plugins.bark-notify.ts` 与主配置的数字校验规则保持一致，并新增模板类型检查。
- 新增 GitHub Actions CI，自动执行安装、类型检查、测试与构建。

## 手动接入说明

请阅读：

- `docs/bark-opencode-setup.md`
