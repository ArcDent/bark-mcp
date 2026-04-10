declare module "@opencode-ai/plugin" {
  export type Config = {
    mcp?: Record<
      string,
      | {
          environment?: Record<string, string>
        }
      | unknown
    >
  }

  export type Plugin = (input: {
    client: {
      app: {
        log(input: {
          body: {
            service: string
            level: string
            message: string
            extra?: Record<string, unknown>
          }
        }): Promise<void>
      }
    }
  }) => Promise<{
    config?: (input: Config) => Promise<void>
    event?: (input: {
      event: {
        type: string
        properties?: unknown
      }
    }) => Promise<void>
  }>
}
