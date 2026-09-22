import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatToolError, GmoApiError } from "../src/client/errors.js";
import { parseEnvelope } from "../src/client/http.js";

describe("parseEnvelope", () => {
  it("returns data from a successful envelope", async () => {
    const response = new Response(
      JSON.stringify({ status: 0, data: { status: "OPEN" } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );

    assert.deepEqual(await parseEnvelope(response), { status: "OPEN" });
  });

  it("surfaces a non-zero API status even with HTTP 404", async () => {
    const response = new Response(
      JSON.stringify({
        status: 2,
        messages: [
          { message_code: "ERR-5207", message_string: "Not found" },
        ],
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );

    await assert.rejects(
      parseEnvelope(response),
      (error: unknown) => {
        assert.ok(error instanceof GmoApiError);
        assert.equal(error.httpStatus, 404);
        assert.equal(error.status, 2);
        assert.equal(error.messages[0]?.message_code, "ERR-5207");
        assert.match(error.message, /ERR-5207/);
        return true;
      },
    );
  });

  it("turns a non-JSON body into GmoApiError", async () => {
    const response = new Response("Service unavailable", { status: 503 });

    await assert.rejects(
      parseEnvelope(response),
      (error: unknown) => {
        assert.ok(error instanceof GmoApiError);
        assert.equal(error.httpStatus, 503);
        assert.equal(error.rawBody, "Service unavailable");
        return true;
      },
    );
  });

  it("truncates a 10 KB non-JSON body in tool output", async () => {
    const rawBody = "x".repeat(10 * 1024);
    const response = new Response(rawBody, { status: 503 });

    await assert.rejects(parseEnvelope(response), (error: unknown) => {
      assert.ok(error instanceof GmoApiError);
      assert.equal(error.rawBody.length, 10240);
      const result = formatToolError(error);
      const block = result.content[0];
      const text = block?.type === "text" ? block.text : "";
      const marker = "... [truncated, 10240 bytes total]";
      const expected = JSON.stringify(
        {
          error: "GMO Coin API error",
          httpStatus: 503,
          messages: [
            { message: "GMO Coin returned a non-JSON response (HTTP 503)" },
          ],
          rawBody: `${"x".repeat(2048)}${marker}`,
        },
        null,
        2,
      );
      assert.equal(text, expected);
      assert.equal(text.length, expected.length);
      assert.match(text, /\[truncated, 10240 bytes total\]/);
      assert.equal(text.split("x").length - 1, 2048);
      return true;
    });
  });
});
