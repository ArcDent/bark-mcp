---
description: 通过本地 Bark MCP 发送一条 Bark 通知
agent: build
---
请调用 `bark_send` MCP 工具发送 Bark 通知。

要求：
- 将用户提供的内容作为通知正文发送。
- 不要尝试设置或覆盖通知标题，标题只能来自配置。
- 如果用户没有提供消息内容，先询问消息内容，再执行发送。

消息内容：
$ARGUMENTS
