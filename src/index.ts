#!/usr/bin/env node
import { startHttpServer } from "./server/http.js";
import { startMcpServer } from "./server/mcp.js";
import { VERSION } from "./config.js";
import { openCanvas } from "./open-canvas.js";

if (["--version", "-v"].includes(process.argv[2] || "")) console.log(VERSION);
else if (["--help", "-h", "help"].includes(process.argv[2] || "")) console.log("SupDance Canvas Agent\nUsage: supdance-canvas-agent [open --handoff | mcp | --version]");
else if (process.argv[2] === "mcp") await startMcpServer();
else if (process.argv[2] === "open") {
    try {
        await openCanvas(process.argv.slice(3));
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}
else startHttpServer();
