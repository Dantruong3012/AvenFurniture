import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = (await readFile(new URL("../lib/media/cloudinary.ts", import.meta.url), "utf8")).replace('import "server-only";', "");
const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const media = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
process.env.CLOUDINARY_CLOUD_NAME = "aven-test";
process.env.CLOUDINARY_API_KEY = "public-test-key";
process.env.CLOUDINARY_API_SECRET = "fixture-secret-only";

function response(overrides = {}) {
  const public_id = "avenfurniture/catalog/11111111-1111-4111-8111-111111111111";
  const version = 123;
  const signature = createHash("sha1").update(`public_id=${public_id}&version=${version}fixture-secret-only`).digest("hex");
  return { asset_id: "abcdefghijklmnop", public_id, version, signature, resource_type: "image", type: "upload", format: "webp", bytes: 1024, width: 100, height: 100, secure_url: `https://res.cloudinary.com/aven-test/image/upload/v${version}/${public_id}.webp`, ...overrides };
}

test("signed upload exposes only public values and fixed upload constraints", () => {
  const intent = media.createUploadIntent();
  assert.equal(intent.apiKey, "public-test-key");
  assert.equal(intent.params.allowed_formats, "jpg,png,webp,avif");
  assert.equal(intent.params.overwrite, "false");
  assert.match(intent.params.public_id, /^avenfurniture\/catalog\/[0-9a-f-]{36}$/);
  assert.ok(!JSON.stringify(intent).includes("fixture-secret-only"));
});
test("upload response rejects signature, folder, format, bytes and URL tampering", () => {
  assert.equal(media.validateUploadResponse(response()).bytes, 1024);
  for (const changed of [
    { signature: "0".repeat(40) }, { public_id: "wrong/folder/11111111-1111-4111-8111-111111111111" },
    { format: "svg" }, { bytes: 10 * 1024 * 1024 + 1 }, { width: 0 },
    { secure_url: "https://evil.example/image.webp" },
  ]) assert.throws(() => media.validateUploadResponse(response(changed)));
});
