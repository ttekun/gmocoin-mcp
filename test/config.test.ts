import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyOperatorCeilings,
  loadConfig,
  parseOperatorLimits,
} from "../src/config.js";

function userConfig(overrides: Record<string, string> = {}) {
  return loadConfig({
    GMO_API_KEY: "key",
    GMO_API_SECRET: "secret",
    GMO_ENABLE_TRADING: "true",
    ...overrides,
  });
}

describe("operator ceilings", () => {
  it("intersects user and operator symbol allowlists", () => {
    const result = applyOperatorCeilings(
      userConfig({ GMO_ALLOWED_SYMBOLS: "BTC,ETH,XRP" }),
      parseOperatorLimits({ GMO_ALLOWED_SYMBOLS: "ETH,XRP,SOL" }),
    );

    assert.deepEqual([...result.allowedSymbols!], ["ETH", "XRP"]);
  });

  it("preserves an empty symbol intersection", () => {
    const result = applyOperatorCeilings(
      userConfig({ GMO_ALLOWED_SYMBOLS: "BTC" }),
      parseOperatorLimits({ GMO_ALLOWED_SYMBOLS: "ETH" }),
    );

    assert.deepEqual([...result.allowedSymbols!], []);
  });

  it("uses either symbol allowlist when only one is configured", () => {
    const userOnly = applyOperatorCeilings(
      userConfig({ GMO_ALLOWED_SYMBOLS: "BTC" }),
      parseOperatorLimits({}),
    );
    const operatorOnly = applyOperatorCeilings(
      userConfig(),
      parseOperatorLimits({ GMO_ALLOWED_SYMBOLS: "ETH" }),
    );

    assert.deepEqual([...userOnly.allowedSymbols!], ["BTC"]);
    assert.deepEqual([...operatorOnly.allowedSymbols!], ["ETH"]);
  });

  it("uses the smaller maximum order size", () => {
    const userSmaller = applyOperatorCeilings(
      userConfig({ GMO_MAX_ORDER_SIZE: "0.01" }),
      parseOperatorLimits({ GMO_MAX_ORDER_SIZE: "0.1" }),
    );
    const operatorSmaller = applyOperatorCeilings(
      userConfig({ GMO_MAX_ORDER_SIZE: "10.0" }),
      parseOperatorLimits({ GMO_MAX_ORDER_SIZE: "2" }),
    );

    assert.equal(userSmaller.maxOrderSize, "0.01");
    assert.equal(operatorSmaller.maxOrderSize, "2");
  });

  it("propagates an invalid size limit from either side", () => {
    const invalidUser = applyOperatorCeilings(
      userConfig({ GMO_MAX_ORDER_SIZE: "invalid" }),
      parseOperatorLimits({ GMO_MAX_ORDER_SIZE: "1" }),
    );
    const invalidOperator = applyOperatorCeilings(
      userConfig({ GMO_MAX_ORDER_SIZE: "1" }),
      parseOperatorLimits({ GMO_MAX_ORDER_SIZE: "invalid" }),
    );

    assert.equal(invalidUser.maxOrderSizeInvalid, true);
    assert.equal(invalidUser.maxOrderSize, undefined);
    assert.equal(invalidOperator.maxOrderSizeInvalid, true);
    assert.equal(invalidOperator.maxOrderSize, undefined);
  });

  it("requires both the user opt-in and operator kill switch", () => {
    const operatorDisabled = applyOperatorCeilings(
      userConfig(),
      parseOperatorLimits({}),
    );
    const userDisabled = applyOperatorCeilings(
      loadConfig({ GMO_API_KEY: "key", GMO_API_SECRET: "secret" }),
      parseOperatorLimits({ GMO_ENABLE_TRADING: "true" }),
    );
    const bothEnabled = applyOperatorCeilings(
      userConfig(),
      parseOperatorLimits({ GMO_ENABLE_TRADING: "true" }),
    );

    assert.equal(operatorDisabled.tradingEnabled, false);
    assert.equal(userDisabled.tradingEnabled, false);
    assert.equal(bothEnabled.tradingEnabled, true);
  });
});
