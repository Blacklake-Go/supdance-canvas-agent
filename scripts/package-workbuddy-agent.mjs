#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const version = process.argv[2] || "0.1.5";
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Pass a stable WorkBuddy Agent package version, for example 0.1.5");

execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
const out = path.join(root, ".release", "workbuddy-agent-" + version);
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(root, "dist"), path.join(out, "dist"), { recursive: true, force: true });
for (const name of ["agent-instructions.md", "LICENSE", "NOTICE.md"]) {
    fs.copyFileSync(path.join(root, name), path.join(out, name));
}
const readme = "# @supdance/canvas-agent-workbuddy\n\nMinimal runtime package for the SupDance Canvas WorkBuddy connector. Built from the shared Agent source repository at " + (process.env.GITHUB_SHA || "the tagged source revision") + ".\n\nThis WorkBuddy package omits the optional Codex app-server runtime dependency; the canvas HTTP and MCP bridge is unchanged.\n";
fs.writeFileSync(path.join(out, "README.md"), readme);
const pkg = {
    name: "@supdance/canvas-agent-workbuddy",
    version,
    description: "Local MCP and browser bridge for SupDance Canvas in WorkBuddy",
    license: "MIT",
    type: "module",
    main: "./dist/index.js",
    bin: { "supdance-canvas-agent-workbuddy": "dist/index.js" },
    files: ["dist", "agent-instructions.md", "README.md", "NOTICE.md", "npm-shrinkwrap.json"],
    engines: { node: ">=18" },
    dependencies: {
        "@modelcontextprotocol/sdk": "1.32.1",
        express: "5.1.0",
        "strip-ansi": "7.2.0",
        winston: "3.19.0",
        yaml: "2.9.0",
        zod: "3.25.76",
    },
};
fs.writeFileSync(path.join(out, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
process.stdout.write(out + "\n");
