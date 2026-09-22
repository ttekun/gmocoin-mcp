import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GmoApiError } from "../src/client/errors.js";
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
});
