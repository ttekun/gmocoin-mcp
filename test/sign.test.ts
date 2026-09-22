import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { sign } from "../src/client/sign.js";

describe("sign", () => {
  const secret = "test-secret";
  const timestamp = "1700000000000";

  it("signs a GET request without a body", () => {
    const input = `${timestamp}GET/v1/account/margin`;
    const expected = createHmac("sha256", secret).update(input).digest("hex");

    assert.equal(
      sign(secret, timestamp, "GET", "/v1/account/margin"),
      expected,
    );
  });

  it("signs the exact POST JSON text", () => {
    const body = '{"symbol":"BTC","side":"BUY","size":"0.001"}';
    const input = `${timestamp}POST/v1/order${body}`;
    const expected = createHmac("sha256", secret).update(input).digest("hex");

    assert.equal(sign(secret, timestamp, "POST", "/v1/order", body), expected);
  });

  it("excludes a GET query string from the signed path", () => {
    const expected = createHmac("sha256", secret)
      .update(`${timestamp}GET/v1/orders`)
      .digest("hex");

    assert.equal(sign(secret, timestamp, "GET", "/v1/orders"), expected);
    assert.notEqual(
      sign(secret, timestamp, "GET", "/v1/orders?orderId=123"),
      expected,
    );
  });
});
