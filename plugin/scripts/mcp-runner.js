#!/usr/bin/env node
/**
 * MCP Runner - Finds and executes Bun for long-running MCP server processes.
 *
 * Unlike bun-runner.js (which buffers stdin for hooks), this wrapper streams
 * stdin directly to bun. MCP servers require a continuous bidirectional stdio
 * channel — buffering stdin breaks the JSON-RPC protocol.
 *
 * Usage: node mcp-runner.js <script> [args...]
 */
import { spawnSync, spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const IS_WINDOWS = process.platform === "win32";

function findBun() {
  const pathCheck = spawnSync(IS_WINDOWS ? "where" : "which", ["bun"], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    shell: IS_WINDOWS,
  });

  if (pathCheck.status === 0 && pathCheck.stdout.trim()) {
    return "bun";
  }

  const bunPaths = IS_WINDOWS
    ? [join(homedir(), ".bun", "bin", "bun.exe")]
    : [
        join(homedir(), ".bun", "bin", "bun"),
        "/usr/local/bin/bun",
        "/opt/homebrew/bin/bun",
        "/home/linuxbrew/.linuxbrew/bin/bun",
      ];

  for (const bunPath of bunPaths) {
    if (existsSync(bunPath)) {
      return bunPath;
    }
  }

  return null;
}

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: node mcp-runner.js <script> [args...]");
  process.exit(1);
}

const bunPath = findBun();

if (!bunPath) {
  console.error("Error: Bun not found. Please install Bun: https://bun.sh");
  process.exit(1);
}

// Stream stdin directly — MCP servers need continuous bidirectional stdio.
// Do NOT buffer stdin like bun-runner.js does: that breaks JSON-RPC streaming.
const child = spawn(bunPath, args, {
  stdio: "inherit",
  windowsHide: true,
  env: process.env,
});

child.on("error", (err) => {
  console.error(`Failed to start Bun: ${err.message}`);
  process.exit(1);
});

child.on("close", (code) => {
  process.exit(code ?? 0);
});
