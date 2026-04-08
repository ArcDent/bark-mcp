# Bark MCP for OpenCode

This repository contains a local Bark MCP server and docs for **manual** OpenCode wiring.

It does **not** ship any live `.opencode` commands or plugins.
Nothing in this repository is auto-loaded by OpenCode unless you manually copy the optional templates into your own `.opencode/` directory.

## Layout

- `MCPs/bark-mcp`: local MCP server that sends Bark notifications
- `docs/bark-opencode-setup.md`: minimal manual setup guide
- `docs/templates/`: optional command/plugin templates for manual copying

## What is fixed by config

The Bark notification `title` is fixed by configuration and is never exposed as a runtime tool argument.

## Manual setup

See `docs/bark-opencode-setup.md`.
