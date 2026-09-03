// Parity and doctrine tests for the ECZ-ID Plugin Foundry (node:test, no deps).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { detectEvidence, computeReviewPriority, selectContextualActions, renderReview, listFiles } from "../foundry/review-engine.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const facts = JSON.parse(readFileSync(join(root, "foundry", "product-facts.json"), "utf8"));
const dora = JSON.parse(readFileSync(join(root, "foundry", "facts", "dora-readiness.json"), "utf8"));
const sbom = JSON.parse(readFileSync(join(root, "foundry", "facts", "sbom-cra-readiness.json"), "utf8"));
const defs = JSON.parse(readFileSync(join(root, "foundry", "plugins.json"), "utf8"));

const fixture = (files) => {
  const dir = mkdtempSync(join(tmpdir(), "eczid-foundry-"));
  for (const f of files) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), "fixture\n"); }
  return dir;
};

test("engine parity with the VS Code value layer: DORA priority rules", () => {
  const s = dora.spec, p = dora.profile;
  assert.equal(computeReviewPriority(s, detectEvidence(s, [], "x"), p).priority, "HIGH");
  const base = ["registers/ict-third-party-register.csv", "policies/operational-resilience-policy.md", "contracts/exit-plan.md"];
  assert.equal(computeReviewPriority(s, detectEvidence(s, base, "x"), p).priority, "HIGH");
  assert.equal(computeReviewPriority(s, detectEvidence(s, [...base, "incident-register.csv"], "x"), p).priority, "ELEVATED");
  assert.equal(computeReviewPriority(s, detectEvidence(s, [...base, "incident-register.csv", "tests/resilience-test-2026.md"], "x"), p).priority, "NORMAL");
});

test("engine parity with the VS Code value layer: SBOM & CRA priority rules and either-format SBOM", () => {
  const s = sbom.spec, p = sbom.profile;
  assert.equal(computeReviewPriority(s, detectEvidence(s, [], "x"), p).priority, "HIGH");
  assert.equal(computeReviewPriority(s, detectEvidence(s, ["bom.json", "package-lock.json", "SECURITY.md", "CHANGELOG.md"], "x"), p).priority, "ELEVATED");
  assert.equal(computeReviewPriority(s, detectEvidence(s, ["bom.json", "package-lock.json", "CHANGELOG.md"], "x"), p).priority, "HIGH");
  assert.equal(computeReviewPriority(s, detectEvidence(s, ["sbom/bom.json", "sbom/release.spdx.json", "package-lock.json", "vex/openvex.json", "SECURITY.md", "attestations/provenance.intoto.jsonl", "CHANGELOG.md"], "x"), p).priority, "NORMAL");
  assert.ok(detectEvidence(s, ["release.spdx.json"], "x").observed.some((i) => i.id === "sbom.machinereadable"));
});

test("contextual actions: at most three, free tool and guidance ahead of paid routes", () => {
  const s = dora.spec, p = dora.profile;
  const a = selectContextualActions(detectEvidence(s, ["policies/operational-resilience-policy.md"], "x"), p);
  assert.ok(a.length <= 3);
  assert.equal(a[0].kind, "free-tool");
  assert.equal(a[1].kind, "guidance");
});

test("every plugin-defined review profile covers its detectors and ranks free tools/guidance first", () => {
  for (const d of defs.plugins.filter((x) => x.review && x.review.spec)) {
    const ids = d.review.spec.detectors.map((x) => x.id).sort();
    assert.deepEqual(d.review.profile.guidance.map((g) => g.detectorId).sort(), ids, d.id);
    const primary = d.review.profile.guidance.filter((g) => g.weightWhenNotObserved === "high");
    assert.equal(primary.length, 1, `${d.id} must have exactly one primary (high) class`);
    const empty = detectEvidence(d.review.spec, [], "x");
    const acts = selectContextualActions(empty, d.review.profile);
    assert.ok(acts.length <= 3);
    assert.ok(["free-tool", "guidance", "identity"].includes(acts[0].kind), `${d.id}: first action must not be a paid route`);
  }
});

test("rendered reviews never assert a forbidden claim and never show a score", () => {
  const forbidden = facts.forbiddenClaims.map((s) => new RegExp(s, "i"));
  for (const bundle of [dora, sbom]) {
    const md = renderReview(bundle.spec, detectEvidence(bundle.spec, ["README.md"], "ws"), bundle.profile);
    for (const re of forbidden) {
      // negation-aware: a hit is only a violation without a negator earlier in the sentence
      let m; const g = new RegExp(re.source, "gi");
      while ((m = g.exec(md)) !== null) {
        const start = Math.max(0, md.lastIndexOf(".", m.index) + 1, md.lastIndexOf("\n", m.index) + 1);
        assert.match(md.slice(start, m.index), /\b(not|never|no|without|does not|isn't|nor|cannot)\b/i, `asserted "${m[0]}"`);
      }
    }
    assert.doesNotMatch(md, /\b\d{1,3}\s*(\/\s*100|%)\b/);
  }
});

test("generated review scripts reproduce the engine result on a real directory (no file is opened)", () => {
  const dir = fixture(["registers/ict-third-party-register.csv", "policies/operational-resilience-policy.md", "contracts/exit-plan.md", ".env", "node_modules/x/index.js"]);
  const script = join(root, "plugins", "eczid-dora-readiness", "skills", "dora-evidence-review", "scripts", "review.mjs");
  assert.ok(existsSync(script), "run `npm run build` first");
  const out = execFileSync(process.execPath, [script, dir], { encoding: "utf8" });
  assert.match(out, /## Review Priority: HIGH/);
  assert.match(out, /ICT third-party register: OBSERVED, REVIEW REQUIRED/);
  const j = JSON.parse(execFileSync(process.execPath, [script, dir, "--json"], { encoding: "utf8" }));
  assert.equal(j.review_priority.level, "HIGH");
  assert.ok(!j.observations.some((o) => (o.path ?? "").includes("node_modules") || (o.path ?? "").startsWith(".env")));
  assert.equal(j.privacy.source_upload, false);
});

test("MCP plugins read dot-directory configs by explicit opt-in only", () => {
  const dir = fixture([".vscode/mcp.json", ".cursor/mcp.json", "src/index.ts", ".env"]);
  const withOptIn = listFiles(dir, { extraDotEntries: [".vscode", ".cursor"] });
  assert.ok(withOptIn.includes(".vscode/mcp.json") && withOptIn.includes(".cursor/mcp.json"));
  assert.ok(!withOptIn.includes(".env"));
  const without = listFiles(dir);
  assert.ok(!without.includes(".vscode/mcp.json"));
  const script = join(root, "plugins", "eczid-mcp-trust", "skills", "mcp-trust-review", "scripts", "review.mjs");
  const j = JSON.parse(execFileSync(process.execPath, [script, dir, "--json"], { encoding: "utf8" }));
  assert.ok(j.observations.some((o) => o.id === "mcp.config" && o.status === "review-required"));
});

test("build is idempotent: a second run changes no bytes", () => {
  const snapshot = (d) => { const m = {}; const walk = (p, rel) => { for (const e of readdirSync(p, { withFileTypes: true })) { const r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) walk(join(p, e.name), r); else m[r] = readFileSync(join(p, e.name), "utf8"); } }; walk(d, ""); return m; };
  const before = snapshot(join(root, "plugins"));
  execFileSync(process.execPath, [join(root, "foundry", "build.mjs")], { stdio: "pipe" });
  assert.deepEqual(snapshot(join(root, "plugins")), before);
});

test("marketplaces list exactly the generated plugins and the pinned verifier version appears in every mcp.json", () => {
  const dirs = readdirSync(join(root, "plugins")).filter((d) => existsSync(join(root, "plugins", d, "plugin.json"))).sort();
  const claude = JSON.parse(readFileSync(join(root, ".claude-plugin", "marketplace.json"), "utf8"));
  const copilot = JSON.parse(readFileSync(join(root, ".github", "plugin", "marketplace.json"), "utf8"));
  assert.deepEqual(claude.plugins.map((p) => p.name).sort(), dirs);
  assert.deepEqual(copilot.plugins.map((p) => p.name).sort(), dirs);
  for (const d of dirs) {
    const f = join(root, "plugins", d, "mcp.json");
    if (!existsSync(f)) continue;
    const mj = JSON.parse(readFileSync(f, "utf8"));
    assert.ok(Object.values(mj.mcpServers).every((s) => s.args.includes(`${facts.verifier.npm}@${facts.verifier.version}`)), d);
  }
});
