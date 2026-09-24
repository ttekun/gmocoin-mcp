import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { privateRequest } from "../src/client/http.js";
import { sign } from "../src/client/sign.js";

const originalFetch = globalThis.fetch;
const credentials = {
  apiKey: "configured-key",
  apiSecret: "configured-secret",
};

interface CapturedRequest {
  input: string | URL | Request;
  init?: RequestInit;
}

let captured: CapturedRequest | undefined;

afterEach(() => {
  globalThis.fetch = originalFetch;
  captured = undefined;
});

function stubFetch(): void {
  globalThis.fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    captured = { input, init };
    return new Response(JSON.stringify({ status: 0, data: { ok: true } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

describe("privateRequest", () => {
  it("signs a GET bare path while sending its encoded query", async () => {
    stubFetch();

    await privateRequest(credentials, "GET", "/v1/orders", {
      query: { orderId: "1,2" },
    });

    assert.ok(captured);
    assert.equal(captured.init?.redirect, "manual");
    const url = new URL(String(captured.input));
    const headers = new Headers(captured.init?.headers);
    const timestamp = headers.get("API-TIMESTAMP");

    assert.equal(url.pathname, "/private/v1/orders");
    assert.match(url.search, /orderId=1%2C2/);
    assert.equal(url.searchParams.get("orderId"), "1,2");
    assert.match(timestamp ?? "", /^\d{13}$/);
    assert.equal(headers.get("API-KEY"), credentials.apiKey);
    assert.equal(
      headers.get("API-SIGN"),
      sign(
        credentials.apiSecret,
        timestamp!,
        "GET",
        "/v1/orders",
        "",
      ),
    );
    assert.equal(captured.init?.body, undefined);
    assert.equal(headers.has("Content-Type"), false);
  });

  it("signs and sends the byte-identical POST body", async () => {
    stubFetch();
    const body = { symbol: "BTC", side: "BUY", size: "0.001" };

    await privateRequest(credentials, "POST", "/v1/order", { body });

    assert.ok(captured);
    assert.equal(captured.init?.redirect, "manual");
    const headers = new Headers(captured.init?.headers);
    const timestamp = headers.get("API-TIMESTAMP");
    const bodyText = captured.init?.body;

    assert.match(timestamp ?? "", /^\d{13}$/);
    assert.equal(headers.get("API-KEY"), credentials.apiKey);
    assert.equal(headers.get("Content-Type"), "application/json");
    assert.equal(typeof bodyText, "string");
    assert.equal(bodyText, JSON.stringify(body));
    assert.equal(
      headers.get("API-SIGN"),
      sign(
        credentials.apiSecret,
        timestamp!,
        "POST",
        "/v1/order",
        bodyText as string,
      ),
    );
  });
});
