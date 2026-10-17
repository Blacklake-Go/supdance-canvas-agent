# @supdance/canvas-agent

The local HTTP and MCP bridge for SupDance Canvas. Codex and WorkBuddy
connectors can both launch this Agent. The source and release artifacts live
in this repository.

Commands:

```bash
supdance-canvas-agent open --handoff
supdance-canvas-agent open
supdance-canvas-agent mcp
supdance-canvas-agent
```

`open --handoff` starts or reuses the Agent and returns a short-lived local
link for the browser. `open` uses the system browser. `mcp` serves Canvas
tools over stdio. The final command runs the local HTTP Agent in the foreground.

WorkBuddy users can call `canvas_open` through MCP. It opens the recent
canvas and pairs the browser; `canvas_connection_status` reports the live
Agent and browser state. Do not treat Agent health alone as proof that a
canvas is connected: require `hasCanvas=true` and read `canvas_get_state`.

Both processes use `~/.supdance-canvas/canvas-agent.json` and protocol 6.
Only `https://canvas.supdance.com` is permitted as a browser Origin. This
package does not call or depend on `@basketikun/canvas-agent` at runtime.

The long-lived Agent token remains in the user's protected local
configuration. Browser pairing uses a single-use ticket with a 60-second
expiry. Generated image requests can consume SupDance credits and should
only be submitted when the user explicitly requests generation.

The source derives from basketikun's MIT-licensed Infinite Canvas Agent; see
the accompanying LICENSE and the repository NOTICE.md.
