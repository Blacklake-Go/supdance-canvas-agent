import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.resolve(import.meta.dirname, "..");
const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "supdance-workbuddy-live-"));
const port = await unusedPort();
const url = `http://127.0.0.1:${port}`;
const env = { ...process.env, SUPDANCE_CANVAS_CONFIG_DIR: configDir, PORT: String(port) };
const httpAgent = spawn(process.execPath, [path.join(root, "dist/index.js")], { cwd: root, env, stdio: "ignore" });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, "dist/index.js"), "mcp"], cwd: root, env, stderr: "pipe" });
const client = new Client({ name: "workbuddy-live-check", version: "1.0.0" });

try {
    await waitForHealth(url);
    await client.connect(transport);
    const before = await call("canvas_connection_status");
    assert.equal(before.agentRunning, true);
    const opened = await call("canvas_open", { mode: "recent" });
    assert.equal(opened.browserOpened, true);
    let state;
    let status;
    for (let attempt = 0; attempt < 20; attempt++) {
        status = await call("canvas_connection_status");
        if (status.hasCanvas) {
            state = await call("canvas_get_state");
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert.equal(status?.hasCanvas, true, "the website did not pair with the local Agent");
    assert.ok(state && Array.isArray(state.nodes), "canvas_get_state did not return nodes");
    const selection = await call("canvas_get_selection");
    console.log(JSON.stringify({ result: "connected", agentVersion: status.agentVersion, protocolVersion: status.protocolVersion, hasCanvas: status.hasCanvas, title: state.title || "", nodes: state.nodes.length, selectedNodes: selection.nodes?.length ?? 0 }));
} finally {
    await client.close().catch(() => {});
    httpAgent.kill("SIGTERM");
    await new Promise((resolve) => httpAgent.once("close", resolve));
    fs.rmSync(configDir, { recursive: true, force: true });
}

async function call(name, args = {}) {
    const result = await client.callTool({ name, arguments: args });
    if (result.isError) throw new Error(`${name} returned an MCP error`);
    const content = result.content[0];
    assert.equal(content.type, "text");
    return JSON.parse(content.text);
}

async function waitForHealth(url) {
    for (let attempt = 0; attempt < 40; attempt++) {
        try {
            const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1000) });
            if (response.ok) return;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("isolated Agent did not start");
}

async function unusedPort() {
    const server = net.createServer();
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    return address.port;
}
