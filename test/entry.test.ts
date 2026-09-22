import assert from "node:assert/strict";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { it } from "node:test";

it("starts through a symlinked npm bin entry", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gmocoin-mcp-bin-"));
  const entry = resolve("dist/index.js");
  const link = join(directory, "gmocoin-mcp");
  await symlink(entry, link);

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [link],
    stderr: "pipe",
  });
  const client = new Client({ name: "symlink-test", version: "1.0.0" });

  try {
    await client.connect(transport);
    const result = await client.listTools();
    assert.equal(result.tools.length, 6);
  } finally {
    await client.close();
    await rm(directory, { recursive: true, force: true });
  }
});
