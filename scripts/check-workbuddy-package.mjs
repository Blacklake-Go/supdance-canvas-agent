#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const tarball = path.resolve(process.argv[2] || "");
if (!fs.existsSync(tarball)) throw new Error("Pass the path to the fixed WorkBuddy Agent tarball");

const packageJson = JSON.parse(execFileSync("tar", ["-xOf", tarball, "package/package.json"], { encoding: "utf8" }));
assert.equal(packageJson.bin?.["supdance-canvas-agent-workbuddy"], "workbuddy-entry.js");
const runtimeEnv = { ...process.env };
delete runtimeEnv.SUPDANCE_CANVAS_DISABLE_CODEX;
const runtimeCheck = execFileSync("npx", ["--yes", `--package=${tarball}`, "supdance-canvas-agent-workbuddy", "--verify-workbuddy-runtime"], {
    encoding: "utf8",
    env: runtimeEnv,
    stdio: ["ignore", "pipe", "inherit"],
});
assert.deepEqual(JSON.parse(runtimeCheck), { codexDisabled: true }, "WorkBuddy binary must disable Codex even when the client omits static environment variables");

const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "supdance-workbuddy-package-check-"));
const transport = new StdioClientTransport({
    command: "npx",
    args: ["--yes", `--package=${tarball}`, "supdance-canvas-agent-workbuddy", "mcp"],
    env: {
        ...runtimeEnv,
        SUPDANCE_CANVAS_CONFIG_DIR: path.join(configDir, "config"),
        PORT: "17379",
        npm_config_cache: path.join(configDir, "npm-cache"),
    },
    stderr: "pipe",
});
const client = new Client({ name: "supdance-workbuddy-package-check", version: "1.0.0" });

try {
    await client.connect(transport);
    const response = await client.listTools();
    const names = new Set(response.tools.map((tool) => tool.name));
    for (const name of ["canvas_open", "canvas_connection_status", "canvas_get_state", "canvas_get_selection", "canvas_generate_image"]) {
        assert.ok(names.has(name), `missing MCP tool: ${name}`);
    }
    const statusResult = await client.callTool({ name: "canvas_connection_status", arguments: {} });
    const statusContent = statusResult.content[0];
    assert.equal(statusContent?.type, "text");
    if (statusContent?.type !== "text") throw new Error("Agent status did not return text");
    const status = JSON.parse(statusContent.text);
    assert.equal(status.agentRunning, false, "clean package check should not depend on an existing Agent");
    assert.equal(status.hasCanvas, false);
    console.log(JSON.stringify({ result: "passed", workbuddyRuntime: "Codex conversation restore disabled by entry point", tools: response.tools.length, requiredTools: ["canvas_open", "canvas_connection_status", "canvas_get_state", "canvas_get_selection", "canvas_generate_image"], unpairedAgentStatus: status }));
} finally {
    await client.close().catch(() => undefined);
    fs.rmSync(configDir, { recursive: true, force: true });
}
