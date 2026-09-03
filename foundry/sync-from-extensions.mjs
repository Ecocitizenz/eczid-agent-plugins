#!/usr/bin/env node
// Snapshot the canonical DORA / SBOM & CRA specs, product facts and value
// profiles from the built VS Code extension sources into foundry/facts/*.json.
// Dev-time only: the monorepo worktree path is passed on the command line.
// The plugins are generated from the JSON snapshots, so the estate never
// depends on the private monorepo at build time. Run after each extension release.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const worktree = process.argv[2];
if (!worktree) { console.error("usage: sync-from-extensions.mjs <monorepo-worktree>"); process.exit(2); }
const req = createRequire(import.meta.url);

const PRODUCTS = [
  { id: "dora-readiness", ext: "eczid-dora-readiness", facts: "DORA_PRODUCT_FACTS", profile: "DORA_VALUE_PROFILE" },
  { id: "sbom-cra-readiness", ext: "eczid-sbom-readiness", facts: "SBOM_PRODUCT_FACTS", profile: "SBOM_VALUE_PROFILE" }
];
for (const p of PRODUCTS) {
  const dist = resolve(worktree, "extensions", p.ext, "dist");
  const spec = req(join(dist, "spec.js")).spec;
  const facts = req(join(dist, "productFacts.js"))[p.facts];
  const profile = req(join(dist, "valueProfile.js"))[p.profile];
  const pkg = req(resolve(worktree, "extensions", p.ext, "package.json"));
  const out = {
    syncedFrom: { extension: `${pkg.publisher}.${pkg.name}`, version: pkg.version },
    spec,
    facts: { ...facts, forbiddenClaims: facts.forbiddenClaims.map((r) => r.source) },
    profile
  };
  writeFileSync(join(here, "facts", `${p.id}.json`), JSON.stringify(out, null, 2) + "\n");
  console.log(`synced ${p.id} from ${pkg.name}@${pkg.version}`);
}
