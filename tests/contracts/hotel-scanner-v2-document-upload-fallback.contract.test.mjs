import assert from "node:assert/strict";
import test from "node:test";

import { readProjectFile } from "../helpers/source-contract.mjs";

test("large remote PDFs fall back from file_url to a bounded uploaded file", async () => {
  const ingestion = await readProjectFile("lib/ai/hotel-scanner-v2-document-ingestion.ts");

  assert.match(ingestion, /import OpenAI, \{ toFile \} from "openai";/);
  assert.match(ingestion, /const MAX_REMOTE_DOCUMENT_BYTES = 50_000_000;/);
  assert.match(ingestion, /const DOCUMENT_UPLOAD_FALLBACK_TIMEOUT_MS = 45_000;/);
  assert.match(ingestion, /if \(!\("file_url" in inputFile\) \|\| !isRemoteFileUrlFetchError\(error\)\) throw error;/);
  assert.match(ingestion, /fetchPublicBinaryV2\(new URL\(inputFile\.file_url\), \{[\s\S]*?maxBytes: MAX_REMOTE_DOCUMENT_BYTES,/);
  assert.match(ingestion, /file: await toFile\(fetched\.buffer, filenameForUrl\(fetched\.url\.toString\(\)\), \{ type: "application\/pdf" \}\)/);
  assert.match(ingestion, /purpose: "user_data"/);
  assert.match(ingestion, /createResponse\(\{ type: "input_file", file_id: uploaded\.id \}\)/);
});

test("temporary uploaded PDF files are deleted after the Responses request", async () => {
  const ingestion = await readProjectFile("lib/ai/hotel-scanner-v2-document-ingestion.ts");

  assert.match(ingestion, /try \{\s*response = await createResponse\(\{ type: "input_file", file_id: uploaded\.id \}\);\s*\} finally \{\s*await openai\.files\.delete\(uploaded\.id\)\.catch\(\(\) => \{\}\);\s*\}/s);
});

test("PDF upload fallback stays generic and does not encode a hotel property", async () => {
  const ingestion = await readProjectFile("lib/ai/hotel-scanner-v2-document-ingestion.ts");

  assert.doesNotMatch(ingestion, /kirmanpremium|arycanda|evrika/iu);
  assert.match(ingestion, /function isRemoteFileUrlFetchError\(error: unknown\)/);
  assert.match(ingestion, /status !== 400/);
});
