import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("WorkBuddy Agent skips restoring a stored Codex thread when Codex runtime is disabled", { timeout: 15_000 }, async (t) => {
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "supdance-workbuddy-agent-"));
    const workspacePath = path.join(configDir, "workspace");
    const port = await unusedPort();
    const baseUrl = `http://127.0.0.1:${port}`;
    fs.writeFileSync(path.join(configDir, "canvas-agent.json"), JSON.stringify({
        url: baseUrl,
        token: "acceptance-only-agent-token",
        workspace: { workspacePath, activeThreadId: "stored-codex-thread" },
    }), { mode: 0o600 });

    const packageRoot = process.cwd();
    const child = spawn(process.execPath, [
        path.join(packageRoot, "node_modules/tsx/dist/cli.mjs"),
        path.join(packageRoot, "src/index.ts"),
    ], {
        cwd: packageRoot,
        env: { ...process.env, SUPDANCE_CANVAS_CONFIG_DIR: configDir, SUPDANCE_CANVAS_DISABLE_CODEX: "1", PORT: String(port) },
        stdio: "ignore",
    });
    t.after(async () => {
        await stop(child);
        fs.rmSync(configDir, { recursive: true, force: true });
    });

    await waitForHealth(baseUrl);
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.ok, true);
    const health = await response.json() as { conversation: { status: string; threadId: string } };
    assert.equal(health.conversation.status, "idle");
    assert.equal(health.conversation.threadId, "");
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

async function waitForHealth(baseUrl: string) {
    for (let attempt = 0; attempt < 50; attempt++) {
        try {
            const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1000) });
            if (response.ok) return;
        } catch {
            // The Agent has not bound its port yet.
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("WorkBuddy Agent did not become ready for acceptance");
}

async function stop(child: ChildProcess) {
    if (child.exitCode !== null) return;
    child.kill("SIGTERM");
    await Promise.race([
        once(child, "exit").then(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
}
