// Parity and doctrine tests for the ECZ-ID Plugin Foundry (node:test, no deps).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { detectEvidence, computeReviewPriority, selectContextualActions, renderReview, listFiles } from "../foundry/review-engine.mjs";
import { archivePath, zipWrite, zipRead } from "../foundry/zip.mjs";
import { stagePlugin, submissionManifest, submissionSkillMd } from "../foundry/openai.mjs";
import { stageExtension, EXTENSION_NAME, DISTRIBUTION_REPO, GENERATION_COMMAND } from "../foundry/gemini.mjs";
import { buildEnterprise } from "../foundry/enterprise.mjs";

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

test("host adapters agree with the Agent Plugins manifest and ship a logo", () => {
  const dirs = readdirSync(join(root, "plugins")).filter((d) => existsSync(join(root, "plugins", d, "plugin.json")));
  for (const d of dirs) {
    const pj = JSON.parse(readFileSync(join(root, "plugins", d, "plugin.json"), "utf8"));
    const cursor = JSON.parse(readFileSync(join(root, "plugins", d, ".cursor-plugin", "plugin.json"), "utf8"));
    const codex = JSON.parse(readFileSync(join(root, "plugins", d, ".codex-plugin", "plugin.json"), "utf8"));
    assert.equal(cursor.name, pj.name); assert.equal(cursor.version, pj.version); assert.equal(codex.version, pj.version);
    assert.ok(existsSync(join(root, "plugins", d, "assets", "logo.png")), `${d} logo`);
    if (existsSync(join(root, "plugins", d, "mcp.json"))) assert.ok(existsSync(join(root, "plugins", d, "mcp_config.json")), `${d} antigravity mcp_config.json`);
  }
  const cursorMp = JSON.parse(readFileSync(join(root, ".cursor-plugin", "marketplace.json"), "utf8"));
  const codexMp = JSON.parse(readFileSync(join(root, ".agents", "plugins", "marketplace.json"), "utf8"));
  assert.deepEqual(cursorMp.plugins.map((p) => p.name).sort(), dirs.sort());
  assert.deepEqual(codexMp.plugins.map((p) => p.name).sort(), dirs.sort());
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

// ---------------------------------------------------------------- OpenAI submission packages

test("archive paths are POSIX, and absolute, relative or duplicate entries are refused", () => {
  const BS = String.fromCharCode(92);
  assert.equal(archivePath(`x${BS}y${BS}z.png`), "x/y/z.png");
  assert.equal(archivePath("./a/b"), "a/b");
  assert.throws(() => archivePath("C:/x"), /absolute archive path/);
  assert.throws(() => archivePath("a/../b"), /relative segment/);
  assert.throws(() => zipWrite([{ name: "d", data: Buffer.from("1") }, { name: "d", data: Buffer.from("2") }]), /duplicate archive entry/);
});

test("the ZIP writer round-trips, is deterministic, and the reader rejects a corrupted archive", () => {
  const mk = () => zipWrite([{ name: "a/b.txt", data: Buffer.from("hello ".repeat(50)) }, { name: "c.bin", data: Buffer.from([1, 2, 3]) }]);
  assert.equal(Buffer.compare(mk(), mk()), 0);
  const read = zipRead(mk());
  assert.deepEqual(read.entries.map((e) => e.name), ["a/b.txt", "c.bin"]);
  assert.match(read.entries[0].data.toString(), /^hello /);
  const corrupt = mk();
  corrupt[40] = corrupt[40] ^ 0xff; // flip a byte inside the first entry's compressed body
  assert.throws(() => zipRead(corrupt), /CRC mismatch|incorrect|invalid/i);
});

test("the submission transforms drop the metadata block and the MCP server declaration", () => {
  const md = ["---", "name: demo-skill", "description: A demo.", "license: MIT", "metadata:", "  author: ecocitizenz", '  version: "0.1.1"', "---", "Body line.", ""].join("\n");
  const out = submissionSkillMd(md);
  assert.match(out, /^---\nname: demo-skill\ndescription: A demo\.\nlicense: MIT\n---\nBody line\./);
  assert.ok(!out.includes("metadata:"), "metadata block must not survive");
  const manifest = submissionManifest({ name: "x", skills: "./skills/", mcpServers: "./.mcp.json", interface: {} });
  assert.equal(manifest.mcpServers, undefined);
  assert.equal(manifest.skills, "./skills/");
});

test("every submitted package carries the skill-root icon and no agents/assets copy", () => {
  for (const def of defs.plugins.filter((d) => d.openai?.submit)) {
    const names = stagePlugin(join(root, "plugins", def.id), def).map((e) => e.name);
    assert.ok(names.includes(".codex-plugin/plugin.json"), `${def.id} manifest`);
    assert.ok(names.includes("assets/logo.png"), `${def.id} plugin-root logo`);
    for (const skill of def.skills) {
      assert.ok(names.includes(`skills/${skill}/assets/logo.png`), `${def.id}: icon must sit at the skill root`);
      assert.ok(!names.includes(`skills/${skill}/agents/assets/logo.png`), `${def.id}: icon must not sit under agents/`);
      assert.ok(names.includes(`skills/${skill}/agents/openai.yaml`), `${def.id}: openai.yaml`);
      assert.ok(names.includes(`skills/${skill}/SKILL.md`), `${def.id}: SKILL.md`);
    }
    assert.ok(!names.some((n) => /mcp(_config)?\.json$/.test(n)), `${def.id}: no MCP config in a skills-only submission`);
  }
});

test("the OpenAI listing limits hold for every plugin definition", () => {
  for (const d of defs.plugins) {
    assert.ok(d.openai, `${d.id} has no openai block`);
    assert.ok(d.displayName.length <= 30, `${d.id} display name is ${d.displayName.length} chars`);
    assert.ok(d.openai.subtitle.length <= 30, `${d.id} subtitle is ${d.openai.subtitle.length} chars`);
    assert.equal(d.openai.starterPrompts.length, 3, `${d.id} needs three starter prompts`);
    assert.ok(d.openai.positiveTests.length >= 5, `${d.id} needs at least five positive tests`);
    assert.ok(d.openai.negativeTests.length >= 3, `${d.id} needs at least three negative tests`);
  }
});

test("preflight passes a clean build and blocks each way a package can be wrong", () => {
  const preflight = (dir) => {
    try {
      execFileSync(process.execPath, [join(root, "foundry", "openai-preflight.mjs"), "--dir", dir], { stdio: "pipe" });
      return 0;
    } catch (e) { return e.status ?? 1; }
  };
  const stageAll = (mutate) => {
    const dir = mkdtempSync(join(tmpdir(), "eczid-preflight-neg-"));
    for (const def of defs.plugins.filter((d) => d.openai?.submit)) {
      let entries = stagePlugin(join(root, "plugins", def.id), def);
      if (mutate) entries = mutate(entries, def) ?? entries;
      writeFileSync(join(dir, `${def.id}-openai-SUBMISSION-READY.zip`), zipWrite(entries));
    }
    return dir;
  };
  const at = (entries, name) => entries.find((e) => e.name === name);

  assert.equal(preflight(stageAll(null)), 0, "a clean build must pass");

  // Icon under agents/, the exact mistake the first submission made.
  assert.equal(preflight(stageAll((entries, def) => {
    if (def.id !== "eczid-dora-readiness") return entries;
    const skill = def.skills[0];
    return entries.map((e) => (e.name === `skills/${skill}/assets/logo.png` ? { ...e, name: `skills/${skill}/agents/assets/logo.png` } : e));
  })), 1, "an icon under agents/ must fail");

  // Subtitle over the 30-character listing cap.
  assert.equal(preflight(stageAll((entries, def) => {
    if (def.id !== "eczid-mcp-trust") return entries;
    const e = at(entries, ".codex-plugin/plugin.json");
    const m = JSON.parse(e.data.toString("utf8"));
    m.interface.shortDescription = "A subtitle that is definitely longer than thirty characters";
    e.data = Buffer.from(JSON.stringify(m, null, 2) + "\n");
    return entries;
  })), 1, "an over-length subtitle must fail");

  // A manifest that declares an MCP server it cannot back with a public URL.
  assert.equal(preflight(stageAll((entries, def) => {
    if (def.id !== "eczid-api-trust") return entries;
    const e = at(entries, ".codex-plugin/plugin.json");
    const m = JSON.parse(e.data.toString("utf8"));
    m.mcpServers = "./.mcp.json";
    e.data = Buffer.from(JSON.stringify(m, null, 2) + "\n");
    return entries;
  })), 1, "a declared MCP server must fail a skills-only submission");

  // A missing manifest.
  assert.equal(preflight(stageAll((entries, def) =>
    def.id === "eczid-agent-trust" ? entries.filter((e) => e.name !== ".codex-plugin/plugin.json") : entries
  )), 1, "a missing manifest must fail");

  // An icon that is neither square nor large enough.
  assert.equal(preflight(stageAll((entries, def) => {
    if (def.id !== "eczid-mcp-verifier") return entries;
    const e = at(entries, "assets/logo.png");
    const small = Buffer.from(e.data);
    small.writeUInt32BE(64, 16); small.writeUInt32BE(32, 20); // claim 64x32 in the IHDR
    e.data = small;
    return entries;
  })), 1, "a non-square, undersized logo must fail");

  // A skill folder whose SKILL.md name no longer matches it.
  assert.equal(preflight(stageAll((entries, def) => {
    if (def.id !== "eczid-dora-readiness") return entries;
    const e = at(entries, `skills/${def.skills[0]}/SKILL.md`);
    e.data = Buffer.from(e.data.toString("utf8").replace(/^name: .*$/m, "name: wrong-name"));
    return entries;
  })), 1, "a skill name that disagrees with its folder must fail");

  // A missing file that the SKILL.md still points at.
  assert.equal(preflight(stageAll((entries, def) =>
    def.id === "eczid-api-trust" ? entries.filter((e) => !e.name.endsWith("/scripts/review.mjs")) : entries
  )), 1, "a referenced-but-absent script must fail");
});

test("the Gemini CLI extension puts its manifest at the root and flattens every skill", () => {
  const entries = stageExtension();
  assert.equal(entries[0].name, "gemini-extension.json", "the manifest must be the archive root entry");
  const manifest = JSON.parse(entries[0].data.toString("utf8"));
  assert.equal(manifest.name, EXTENSION_NAME);
  assert.equal(manifest.version, defs.version);
  assert.equal(manifest.contextFileName, "GEMINI.md");
  assert.ok(entries.some((e) => e.name === "GEMINI.md"), "context file");
  // Gemini auto-discovers skills/<name>/SKILL.md relative to the extension root.
  const skills = [...new Set(entries.map((e) => e.name.match(/^skills\/([^/]+)\//)?.[1]).filter(Boolean))].sort();
  assert.deepEqual(skills, defs.plugins.flatMap((p) => p.skills).sort(), "every plugin skill must be present exactly once");
  for (const s of skills) assert.ok(entries.some((e) => e.name === `skills/${s}/SKILL.md`), `${s} SKILL.md`);
  // The OpenAI listing interface has no meaning here and must not be shipped.
  assert.ok(!entries.some((e) => e.name.endsWith("agents/openai.yaml")), "no OpenAI interface in a Gemini extension");
  assert.ok(Object.values(manifest.mcpServers).every((s) => s.args.includes(`${facts.verifier.npm}@${facts.verifier.version}`)), "verifier pinned");
});

// Regression guard for the awesome-copilot rejection of 2026-09-03 (issues #2919-#2924),
// which read the estate as "purely paid services". Every plugin is free and MIT-licensed;
// the paid products are separate. These are the public surfaces a marketplace reviewer reads.
test("every plugin README leads with the free statement and keeps priced material below it", () => {
  for (const def of defs.plugins) {
    const readme = readFileSync(join(root, "plugins", def.id, "README.md"), "utf8");
    const where = `${def.id} README`;

    // The free statement is unmissable and above everything else.
    const freeHeading = readme.indexOf("## Free agent plugin. No purchase required.");
    assert.ok(freeHeading > 0, `${where}: must carry the free-plugin heading`);
    assert.ok(/open source under the MIT licence/.test(readme), `${where}: must state the licence`);
    assert.ok(/no trial and no paywall/.test(readme), `${where}: must rule out a trial or paywall`);

    // Nothing with a price appears before it, and every price is inside an "Optional" section.
    const prices = [...readme.matchAll(/£[\d.]+/g)].map((m) => m.index);
    const optional = readme.indexOf("\n## Optional");
    for (const i of prices) {
      assert.ok(i > freeHeading, `${where}: a price must never appear above the free statement`);
      assert.ok(optional > 0 && i > optional, `${where}: every price must sit inside an "Optional" section`);
    }

    // A paid route is never presented as something the plugin itself offers or requires.
    if (readme.includes("Optional paid ECZ-ID routes")) {
      assert.ok(readme.includes("**None of these is required.**"), `${where}: paid routes must be marked not required`);
    }
    const paidLinks = [...readme.matchAll(/^- .*: (https:\/\/trustops\.ecocitizenz\.com\S*)$/gm)];
    for (const m of paidLinks) {
      assert.ok(m.index > readme.indexOf("Optional paid ECZ-ID routes"), `${where}: ${m[1]} must sit under the optional-paid heading`);
    }
  }
});

test("the marketplace metadata says the plugins are free in every generated marketplace", () => {
  for (const rel of [".claude-plugin/marketplace.json", ".github/plugin/marketplace.json", ".cursor-plugin/marketplace.json"]) {
    const m = JSON.parse(readFileSync(join(root, rel), "utf8"));
    const description = m.metadata?.description ?? m.description ?? "";
    assert.match(description, /no purchase required/i, `${rel}: metadata description must state that no purchase is required`);
  }
});

// The Gemini gallery needs a dedicated distribution repository (manifest at the absolute
// repo root, skills auto-discovered from that root). It must never read as a second source
// of truth, so every generated surface carries its provenance.
test("the Gemini distribution repository declares itself generated, with its canonical source", () => {
  const entries = stageExtension({ commit: "0".repeat(40) });
  const file = (name) => entries.find((e) => e.name === name)?.data.toString("utf8");

  const readme = file("README.md");
  assert.ok(readme, "README.md must be generated");
  assert.match(readme, /GENERATED — DO NOT HAND EDIT/, "the banner must be verbatim");
  assert.ok(readme.includes(facts.organisation.estateUrl), "canonical source repo");
  assert.ok(readme.includes("0".repeat(40)), "canonical source commit");
  assert.match(readme, /Generation command: npm run gemini/, "generation command");
  assert.match(readme, /No purchase required/, "the free statement travels to every host");

  const gen = JSON.parse(file("GENERATED.json"));
  assert.equal(gen.generated, true);
  assert.equal(gen.doNotHandEdit, true);
  assert.equal(gen.canonicalSourceRepo, facts.organisation.estateUrl);
  assert.equal(gen.canonicalSourceCommit, "0".repeat(40));
  assert.equal(gen.generationCommand, GENERATION_COMMAND);
  assert.equal(gen.distributionRepo, `https://github.com/${DISTRIBUTION_REPO}`);
});

// Kiro Powers requires the power's README to carry a privacy-policy link and a support
// contact (https://kiro.dev/powers/submit/). Both are facts, so the day they are filled in
// every README gains them from one edit; until then nothing dead is published.
test("the privacy and support facts exist, and reach every README the moment they are set", () => {
  assert.ok(facts.compliance, "product-facts must carry a compliance block");
  assert.ok("privacyPolicyUrl" in facts.compliance, "privacyPolicyUrl must be declared, even as null");
  assert.ok("supportContact" in facts.compliance, "supportContact must be declared, even as null");

  const expected = [
    ["privacyPolicyUrl", `- Privacy policy: ${facts.compliance.privacyPolicyUrl}`],
    ["supportContact", `- Support contact: ${facts.compliance.supportContact}`]
  ];
  for (const def of defs.plugins) {
    const readme = readFileSync(join(root, "plugins", def.id, "README.md"), "utf8");
    for (const [key, line] of expected) {
      if (facts.compliance[key]) {
        assert.ok(readme.includes(line), `${def.id}: README must carry ${key}; rerun npm run build`);
      } else {
        assert.ok(!readme.includes(line.split(":")[0] + ":"), `${def.id}: README must not claim a ${key} that is not set`);
      }
    }
  }

  // A privacy policy must live on a host the estate already allows.
  if (facts.compliance.privacyPolicyUrl) {
    const host = new URL(facts.compliance.privacyPolicyUrl).host;
    assert.ok(facts.allowedLinkHosts.some((h) => host === h || host.endsWith(`.${h}`)), `privacy policy host ${host} is not allow-listed`);
  }
});

// Managed distribution for administrators: three standards-based settings files, generated
// from the same facts as every host. A vendor must not narrow what its customers may install,
// so the allowlist key is documented but never pre-set.
test("the enterprise assets enable every plugin and pre-set no restriction policy", () => {
  const built = buildEnterprise({ write: false });
  assert.deepEqual(
    Object.keys(built.enabledPlugins).sort(),
    defs.plugins.map((p) => `${p.id}@${built.marketplace}`).sort(),
    "every plugin must be enabled by the managed settings"
  );
  assert.ok(Object.values(built.enabledPlugins).every((v) => v === true));

  const managed = JSON.parse(built.files["claude-code/managed-settings.json"]);
  assert.deepEqual(managed.extraKnownMarketplaces[built.marketplace].source, {
    source: "github",
    repo: facts.organisation.estateRepo
  });
  for (const key of ["strictKnownMarketplaces", "blockedMarketplaces"]) {
    assert.ok(!(key in managed), `${key} is the administrator's decision and must not be shipped pre-set`);
  }
  const vscode = JSON.parse(built.files["vscode/settings.json"]);
  assert.deepEqual(vscode["chat.plugins.marketplaces"], [facts.organisation.estateRepo]);
});
