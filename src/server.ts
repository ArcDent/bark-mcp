import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { createTestInput, sendBark } from "./bark.js"
import { loadConfig } from "./config.js"

const config = loadConfig()
const server = new McpServer({
  name: "bark-mcp",
  version: "0.1.0",
})

const sendArgs = {
  body: z.string().min(1).optional(),
  markdown: z.string().min(1).optional(),
  subtitle: z.string().min(1).optional(),
  url: z.string().url().optional(),
  icon: z.string().url().optional(),
  sound: z.string().min(1).optional(),
  group: z.string().min(1).optional(),
  level: z.enum(["critical", "active", "timeSensitive", "passive"]).optional(),
  isArchive: z.string().min(1).optional(),
  autoCopy: z.string().min(1).optional(),
  badge: z.number().int().optional(),
  call: z.string().min(1).optional(),
  image: z.string().url().optional(),
  copy: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  volume: z.number().int().min(0).max(10).optional(),
  ciphertext: z.string().min(1).optional(),
  id: z.string().min(1).optional(),
  delete: z.string().min(1).optional(),
}

server.registerTool(
  "bark_send",
  {
    description:
      "Send a Bark notification. Title is fixed from config; subtitle can be supplied per request.",
    inputSchema: sendArgs,
  },
  async (args) => {
    const result = await sendBark(config, args)
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
      isError: !result.ok,
    }
  },
)

server.registerTool(
  "bark_test",
  {
    description: "Send a Bark test notification using config defaults.",
    inputSchema: {},
  },
  async () => {
    const result = await sendBark(config, createTestInput(config))
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
      isError: !result.ok,
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
