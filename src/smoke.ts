import { createTestInput, sendBark } from "./bark.js"
import { loadConfig } from "./config.js"

const config = loadConfig()
const args = process.argv.slice(2)

const input = args.length > 0 ? { body: args.join(" ") } : createTestInput(config)
const result = await sendBark(config, input)

const output = `${JSON.stringify(result, null, 2)}\n`

if (result.ok) {
  process.stdout.write(output)
} else {
  process.stderr.write(output)
  process.exitCode = 1
}
