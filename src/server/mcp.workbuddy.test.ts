import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("WorkBuddy stdio MCP discovers canvas tools and reports an unpaired Agent", { timeout: 15_000 }, async () => {
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "supdance-workbuddy-mcp-"));
    const port = await unusedPort();
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: [path.join(process.cwd(), "node_modules/tsx/dist/cli.mjs"), path.join(process.cwd(), "src/index.ts"), "mcp"],
        cwd: process.cwd(),
        env: { ...process.env, SUPDANCE_CANVAS_CONFIG_DIR: configDir, PORT: String(port) } as Record<string, string>,
        stderr: "pipe",
    });
    const client = new Client({ name: "workbuddy-connector-test", version: "1.0.0" });
    try {
        await client.connect(transport);
        const tools = await client.listTools();
        const names = new Set(tools.tools.map((tool) => tool.name));
        for (const name of ["canvas_open", "canvas_connection_status", "canvas_get_state", "canvas_get_selection", "canvas_generate_image"]) {
            assert.ok(names.has(name), `missing MCP tool: ${name}`);
        }
        const result = await client.callTool({ name: "canvas_connection_status", arguments: {} });
        const content = result.content[0];
        assert.equal(content.type, "text");
        if (content.type !== "text") return;
        const status = JSON.parse(content.text) as { agentRunning: boolean; hasCanvas: boolean };
        assert.equal(status.agentRunning, false);
        assert.equal(status.hasCanvas, false);
    } finally {
        await client.close();
        fs.rmSync(configDir, { recursive: true, force: true });
    }
});

async function unusedPort() {
    const server = net.createServer();
    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    return address.port;
}
