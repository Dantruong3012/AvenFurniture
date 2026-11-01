import assert from "node:assert/strict";
import { test } from "node:test";
import { PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from "next/constants.js";
import { loadModule } from "./helpers/load-module.mjs";

const url = "https://eofdtqnnqgxaoykcbfrv.supabase.co";
const publishableKey = "sb_publishable_test_fixture_only";
const names = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];

function withEnv(values, run) {
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) {
      if (values[name] === undefined) delete process.env[name];
      else process.env[name] = values[name];
    }
    return run();
  } finally {
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
}

test("production build rejects missing public config before any route renders", () => {
  for (const missing of names.slice(0, 2)) {
    const values = { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey, [missing]: "" };
    withEnv(values, () => {
      const config = loadModule("next.config.ts").default;
      assert.throws(() => config(PHASE_PRODUCTION_BUILD), (error) => {
        assert.ok(error.message.includes(missing));
        assert.ok(!error.message.includes(url));
        assert.ok(!error.message.includes(publishableKey));
        return true;
      });
      // Runtime-only processes must still be able to load Next's config.
      assert.doesNotThrow(() => config(PHASE_PRODUCTION_SERVER));
    });
  }
});

test("production build accepts this project's public configuration without a privileged key", () => {
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey }, () => {
    assert.doesNotThrow(() => loadModule("next.config.ts").default(PHASE_PRODUCTION_BUILD));
    assert.deepEqual(loadModule("lib/supabase/config.ts").getSupabaseConfig(), { url, publishableKey });
  });
});

test("secret and differently named keys cannot silently replace the browser publishable key", () => {
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: "sb_secret_fixture_only", NEXT_PUBLIC_SUPABASE_ANON_KEY: "legacy_fixture_only" }, () => {
    assert.throws(() => loadModule("next.config.ts").default(PHASE_PRODUCTION_BUILD), /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });
});

test("production build preserves project and key validation without leaking invalid values", () => {
  for (const [configuredUrl, configuredKey] of [["https://other-project.supabase.co", publishableKey], [url, "sb_secret_fixture_only"], ["invalid-url", publishableKey]]) {
    withEnv({ NEXT_PUBLIC_SUPABASE_URL: configuredUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: configuredKey }, () => {
      assert.throws(() => loadModule("next.config.ts").default(PHASE_PRODUCTION_BUILD), (error) => {
        assert.ok(!error.message.includes(configuredUrl));
        assert.ok(!error.message.includes(configuredKey));
        return true;
      });
    });
  }
});
