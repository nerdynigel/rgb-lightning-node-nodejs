import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { SdkNode } = require("../index.js");
for (const amount of [
  "9007199254740991",
  "9007199254740992",
  "9007199254740993",
  "18446744073709551615",
]) {
  test(`exact swap wrapper round trip ${amount}`, () => {
    const seen = [];
    const reply = `{"qty_from":${amount},"qty_to":${amount},"status":"Waiting"}`;
    const node = new SdkNode({
      makerInit: (raw) => {
        seen.push(raw);
        return reply;
      },
      makerExecute: (raw) => {
        seen.push(raw);
        return reply;
      },
      taker: (raw) => {
        seen.push(raw);
        return reply;
      },
      getSwap: () => reply,
      listSwaps: () => `[${reply}]`,
    });
    const offer = `${amount}/btc/${amount}/rgb:test/9999999999/${"00".repeat(32)}`;
    assert.equal(
      node.makerInitExact({
        qty_from: amount,
        qty_to: amount,
        timeout_sec: "30",
        from_asset: null,
        to_asset: "rgb:test",
      }).qty_from,
      amount,
    );
    assert.ok(seen[0].includes(`"qty_from":${amount}`));
    assert.ok(seen[0].includes(`"qty_to":${amount}`));
    assert.equal(node.makerExecuteExact({ swapstring: offer }).qty_to, amount);
    assert.equal(JSON.parse(seen[1]).swapstring, offer);
    assert.equal(node.takerExact({ swapstring: offer }).qty_from, amount);
    assert.equal(JSON.parse(seen[2]).swapstring, offer);
    assert.equal(node.getSwapExact("00".repeat(32), true).qty_from, amount);
    assert.equal(node.listSwapsExact()[0].qty_to, amount);
  });
}

test("exact wrapper rejects malformed/overflow/numeric requests before native dispatch", () => {
  let called = false;
  const node = new SdkNode({
    makerInit: () => {
      called = true;
    },
  });
  for (const bad of [
    "",
    "01",
    "-1",
    "1.0",
    "1e3",
    " 1",
    "18446744073709551616",
    1,
    9007199254740992,
    1n,
    null,
  ]) {
    assert.throws(() =>
      node.makerInitExact({ qty_from: bad, qty_to: "1", timeout_sec: "30" }),
    );
  }
  assert.equal(called, false);
});
test("exact wrapper rejects non-u64 native numbers without rounded values escaping", () => {
  for (const raw of ["1.5", "1e3", "-1", "18446744073709551616"]) {
    const node = new SdkNode({ getSwap: () => `{"qty_from":${raw}}` });
    assert.throws(() => node.getSwapExact("00".repeat(32), true));
  }
});

