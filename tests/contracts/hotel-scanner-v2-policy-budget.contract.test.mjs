import assert from "node:assert/strict";
import test from "node:test";

import { readProjectFile } from "../helpers/source-contract.mjs";

test("policy extraction gets the bounded global output cap instead of a source-count-sized budget", async () => {
  const source = await readProjectFile("lib/ai/hotel-scanner-v2-extraction-openai.ts");

  assert.match(source, /function outputTokenBudget\(domain: string, expectedCount: number \| null\)/);
  assert.match(source, /if \(domain === "policies"\) return MAX_AI_OUTPUT_TOKENS/);
  assert.match(source, /Math\.min\(MAX_AI_OUTPUT_TOKENS, Math\.max\(3_000, 1_200 \+ expected \* 650\)\)/);
  assert.match(source, /max_output_tokens: outputTokenBudget\(input\.config\.domain, input\.expected\.expectedCount\)/);
});
