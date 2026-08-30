import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadFileConfig, fileConfigPath } from "@/services/fileConfig.js";

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "anmcp-cfg-"));
  file = join(dir, "config.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("loadFileConfig (#24)", () => {
  it("applies file values for keys not already in env", () => {
    writeFileSync(file, JSON.stringify({ APPLE_NOTES_MCP_MAX_BUFFER: "1048576", DEBUG: "1" }));
    const env: NodeJS.ProcessEnv = {};
    const applied = loadFileConfig(env, file);
    expect(env.APPLE_NOTES_MCP_MAX_BUFFER).toBe("1048576");
    expect(env.DEBUG).toBe("1");
    expect(applied.sort()).toEqual(["APPLE_NOTES_MCP_MAX_BUFFER", "DEBUG"]);
  });

  it("never overrides a value already set in the environment", () => {
    writeFileSync(file, JSON.stringify({ APPLE_NOTES_MCP_MAX_BUFFER: "1" }));
    const env: NodeJS.ProcessEnv = { APPLE_NOTES_MCP_MAX_BUFFER: "999" };
    loadFileConfig(env, file);
    expect(env.APPLE_NOTES_MCP_MAX_BUFFER).toBe("999");
  });

  it("treats empty-string env as unset and fills it", () => {
    writeFileSync(file, JSON.stringify({ DEBUG: "1" }));
    const env: NodeJS.ProcessEnv = { DEBUG: "" };
    loadFileConfig(env, file);
    expect(env.DEBUG).toBe("1");
  });

  it("ignores non-string values", () => {
    writeFileSync(
      file,
      JSON.stringify({
        APPLE_NOTES_MCP_A: "ok",
        APPLE_NOTES_MCP_B: 5,
        APPLE_NOTES_MCP_C: true,
      })
    );
    const env: NodeJS.ProcessEnv = {};
    expect(loadFileConfig(env, file)).toEqual(["APPLE_NOTES_MCP_A"]);
  });

  it("merges only this server's namespace plus DEBUG and VERBOSE", () => {
    // The config file is an on-disk input the host app does not manage, so a
    // key outside the allow-list must not reach the environment — PATH and
    // NODE_OPTIONS decide what this process executes and loads.
    writeFileSync(
      file,
      JSON.stringify({
        APPLE_NOTES_MCP_MAX_BUFFER: "1048576",
        DEBUG: "1",
        VERBOSE: "1",
        PATH: "/tmp/evil",
        NODE_OPTIONS: "--require /tmp/evil.js",
        DYLD_INSERT_LIBRARIES: "/tmp/evil.dylib",
        APPLE_NOTES: "near-miss, not the prefix",
      })
    );
    const env: NodeJS.ProcessEnv = {};
    const applied = loadFileConfig(env, file);
    expect(applied.sort()).toEqual(["APPLE_NOTES_MCP_MAX_BUFFER", "DEBUG", "VERBOSE"]);
    expect(env.PATH).toBeUndefined();
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(env.DYLD_INSERT_LIBRARIES).toBeUndefined();
    expect(env.APPLE_NOTES).toBeUndefined();
  });

  it("skips a disallowed key silently, without logging or throwing", () => {
    writeFileSync(file, JSON.stringify({ PATH: "/tmp/evil" }));
    expect(loadFileConfig({}, file)).toEqual([]);
  });

  it("tolerates a missing file and a corrupt file", () => {
    expect(loadFileConfig({}, join(dir, "nope.json"))).toEqual([]);
    writeFileSync(file, "{ not json");
    expect(loadFileConfig({}, file)).toEqual([]);
  });

  it("defaults the path to the app-support dir, honoring the override", () => {
    expect(fileConfigPath({})).toMatch(/apple-notes-mcp\/config\.json$/);
    expect(fileConfigPath({ APPLE_NOTES_MCP_CONFIG_FILE: "/tmp/x.json" })).toBe("/tmp/x.json");
  });
});
