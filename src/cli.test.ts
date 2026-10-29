import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {VERSION} from "./config.js";

const run=promisify(execFile);
test("help and version exit without starting HTTP or writing a connection profile",async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"supdance-cli-v3-"));
  try{
    for(const option of ["--version","--help"]){
      const result=await run(process.execPath,["node_modules/tsx/dist/cli.mjs","src/index.ts",option],{
        cwd:process.cwd(),env:{...process.env,NODE_ENV:"test",SUPDANCE_CANVAS_DISABLE_CODEX:"1",SUPDANCE_CANVAS_CONFIG_DIR:dir},timeout:15000,
      });
      assert.match(result.stdout,option==="--version"?new RegExp(VERSION.replaceAll(".","\\.")):/Usage:/);
      assert.doesNotMatch(result.stdout,/Connect token:|Local URL:/);
      assert.equal(fs.existsSync(path.join(dir,"canvas-agent.json")),false);
    }
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
