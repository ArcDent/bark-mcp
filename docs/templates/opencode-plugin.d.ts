declare module "@opencode-ai/plugin" {
  export type Plugin = (input: {
    client: {
      app: {
        log(input: { body: Record<string, unknown> }): Promise<void>
      }
    }
  }) => Promise<{
    config?: (input: unknown) => Promise<void> | void
    event?: (input: { event: unknown }) => Promise<void> | void
  }>
}
