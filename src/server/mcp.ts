import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { toolDescriptions, toolInputSchemas, toolNames, type ToolName } from "../canvas/schemas.js";
import { AGENT_PROTOCOL_VERSION } from "../canvas/session.js";
import { AGENT_PROMPT, loadConfig, VERSION } from "../config.js";
import { getAgentIdentityError, openCanvas } from "../open-canvas.js";
import { z } from "zod";

type CanvasAgentToolResponse = { ok?: boolean; result?: unknown; error?: string };

/** 启动通过标准输入输出通信的 MCP 服务。 */
export async function startMcpServer() {
    loadConfig(true);
    const server = new McpServer({ name: "supdance-canvas-agent", version: VERSION }, { instructions: AGENT_PROMPT });
    server.registerTool("canvas_open", {
        description: "启动或复用本机 SupDance Canvas Agent，并在系统浏览器打开已连接的画布。默认打开最近画布；调用后用 canvas_get_state 确认网页已经连接。",
        inputSchema: {
            mode: z.enum(["new", "recent", "choose"]).optional(),
            projectId: z.string().regex(/^[A-Za-z0-9_-]+$/).optional(),
        },
    }, async ({ mode, projectId }) => {
        const args = ["--mode=" + (mode || "recent")];
        if (projectId) args.push("--project=" + projectId);
        const result = await openCanvas(args, () => {});
        return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, agentUrl: result.agentUrl, browserOpened: result.browserOpened, nextStep: "网页加载后调用 canvas_get_state 确认 hasCanvas=true" }) }] };
    });
    server.registerTool("canvas_connection_status", {
        description: "检查本机 Agent 是否运行以及网页画布是否连接。仅用于诊断；hasCanvas=true 才能说明当前画布可读。",
        inputSchema: {},
    }, async () => {
        const current = loadConfig(true);
        try {
            const identityResponse = await fetch(`${current.url}/identity`, { headers: { "x-canvas-agent-token": current.token }, signal: AbortSignal.timeout(2000) });
            if (!identityResponse.ok) throw new Error(`Agent identity returned HTTP ${identityResponse.status}`);
            const identity = await identityResponse.json() as { ok?: boolean; service?: string; agentVersion?: string; protocolVersion?: number; url?: string };
            const compatibilityError = getAgentIdentityError(identity, current.url);
            if (compatibilityError) throw new Error(compatibilityError);
            const response = await fetch(`${current.url}/health`, { signal: AbortSignal.timeout(2000) });
            if (!response.ok) throw new Error(`Agent health returned HTTP ${response.status}`);
            const health = await response.json() as Record<string, unknown>;
            if (health.protocolVersion !== AGENT_PROTOCOL_VERSION) throw new Error("Agent protocol version mismatch");
            return { content: [{ type: "text" as const, text: JSON.stringify({ agentRunning: true, agentVersion: identity.agentVersion, ...health }) }] };
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            return { content: [{ type: "text" as const, text: JSON.stringify({ agentRunning: false, hasCanvas: false, reason, nextStep: "调用 canvas_open 启动或检查 SupDance Agent" }) }] };
        }
    });
    toolNames.forEach((name) => registerCanvasTool(server, name));
    await server.connect(new StdioServerTransport());
}

/** 向 MCP Server 注册单个 Canvas Agent 工具。 */
function registerCanvasTool(server: McpServer, name: ToolName) {
    const schema = toolInputSchemas[name];
    server.registerTool(name, { description: toolDescriptions[name], inputSchema: schema.shape }, async (input: unknown) => {
        const result = await postCanvasAgentTool(name, schema.parse(input));
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    });
}

/** 将 MCP 工具调用转发到本地 Canvas Agent HTTP 服务。 */
async function postCanvasAgentTool(name: ToolName, input: unknown) {
    const config = loadConfig(true);
    let res: Response;
    try {
        res = await fetch(`${config.url}/api/tools`, { method: "POST", headers: { "content-type": "application/json", "x-canvas-agent-token": config.token }, body: JSON.stringify({ name, input }), signal: AbortSignal.timeout(30_000) });
    } catch {
        throw new Error("本地 SupDance Agent 未响应；先调用 canvas_open，或检查网页连接与本机端口。");
    }
    if (!res.ok) throw new Error(`本地 SupDance Agent 请求失败：HTTP ${res.status}`);
    const body = (await res.json()) as CanvasAgentToolResponse;
    if (!body.ok) throw new Error(body.error || "tool call failed");
    return body.result;
}
