#!/usr/bin/env node
// ECZ-ID Plugin Foundry validator. Exit 0 = every plugin and both marketplaces
// pass; exit 1 = at least one finding. `--live` additionally fetches every
// distinct https URL and requires a live response.
//
// Checks: Agent Plugins 1.0.0 manifests against the pinned JSON schemas
// (required keys, closed objects, name pattern, $schema value); mcp.json
// server shapes; Claude manifests agree with Agent Plugins manifests; Agent
// Skills frontmatter rules; review scripts parse and run; no forbidden claim
// is asserted on any public surface; every URL is https on an allowed host;
// both marketplaces list exactly the generated plugins.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const facts = JSON.parse(readFileSync(join(here, "product-facts.json"), "utf8"));
const pluginSchema = JSON.parse(readFileSync(join(here, "schemas", "agent-plugins-1.0.0-plugin.schema.json"), "utf8"));
const mcpSchema = JSON.parse(readFileSync(join(here, "schemas", "agent-plugins-1.0.0-mcp.schema.json"), "utf8"));
const LIVE = process.argv.includes("--live");
const findings = [];
const fail = (where, msg) => findings.push(`${where}: ${msg}`);

const read = (p) => readFileSync(p, "utf8");
const isDir = (p) => existsSync(p) && statSync(p).isDirectory();

/** Minimal JSON-schema subset checker: type, required, properties, additionalProperties, pattern, minLength, maxLength, enum, const, items, $ref (local). */
function check(schema, value, path, rootSchema, out) {
  if (schema.$ref) {
    const ref = schema.$ref.replace(/^#\//, "").split("/").reduce((o, k) => o[k], rootSchema);
    return check(ref, value, path, rootSchema, out);
  }
  if (schema.const !== undefined && value !== schema.const) out.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) out.push(`${path}: not in enum ${JSON.stringify(schema.enum)}`);
  const t = schema.type;
  if (t === "object" || schema.properties) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return out.push(`${path}: expected object`);
    for (const r of schema.required ?? []) if (!(r in value)) out.push(`${path}: missing required "${r}"`);
    for (const [k, v] of Object.entries(value)) {
      const ps = schema.properties?.[k];
      if (ps) check(ps, v, `${path}.${k}`, rootSchema, out);
      else if (schema.additionalProperties === false) out.push(`${path}: unexpected property "${k}"`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") check(schema.additionalProperties, v, `${path}.${k}`, rootSchema, out);
      else if (schema.patternProperties) {
        for (const [pp, pschema] of Object.entries(schema.patternProperties)) if (new RegExp(pp).test(k)) check(pschema, v, `${path}.${k}`, rootSchema, out);
      }
    }
    return;
  }
  if (t === "array") {
    if (!Array.isArray(value)) return out.push(`${path}: expected array`);
    if (schema.items) value.forEach((v, i) => check(schema.items, v, `${path}[${i}]`, rootSchema, out));
    return;
  }
  if (t === "string") {
    if (typeof value !== "string") return out.push(`${path}: expected string`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) out.push(`${path}: does not match ${schema.pattern}`);
    if (schema.minLength !== undefined && value.length < schema.minLength) out.push(`${path}: shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) out.push(`${path}: longer than ${schema.maxLength}`);
    if (schema.format === "uri" && !/^https?:\/\//.test(value)) out.push(`${path}: not a URI`);
    return;
  }
  if (schema.oneOf || schema.anyOf) {
    const alts = schema.oneOf ?? schema.anyOf;
    const ok = alts.some((alt) => { const o = []; check(alt, value, path, rootSchema, o); return o.length === 0; });
    if (!ok) out.push(`${path}: matches none of ${alts.length} alternatives`);
  }
}

const NEGATORS = /\b(not|never|no|without|rather than|instead of|does not|doesn't|isn't|nor|neither|cannot)\b/i;
function assertedClaims(text) {
  const out = [];
  for (const src of facts.forbiddenClaims) {
    const re = new RegExp(src, "gi");
    let m;
    while ((m = re.exec(text)) !== null) {
      const start = Math.max(0, text.lastIndexOf(".", m.index) + 1, text.lastIndexOf("\n", m.index) + 1);
      const before = text.slice(start, m.index);
      if (NEGATORS.test(before)) continue;
      out.push(`"${m[0]}" in: ${text.slice(start, m.index + 60).replace(/\s+/g, " ").trim()}`);
    }
  }
  return out;
}
const URL_RE = /https?:\/\/[^\s)\]"'`<>]+/g;
function urlsIn(text) { return [...new Set((text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:]+$/, "")))]; }
function checkUrls(where, text) {
  for (const u of urlsIn(text)) {
    let url;
    try { url = new URL(u); } catch { fail(where, `invalid URL ${u}`); continue; }
    if (url.protocol !== "https:") fail(where, `non-https URL ${u}`);
    if (!facts.allowedLinkHosts.includes(url.hostname)) fail(where, `host not allowed ${url.hostname} (${u})`);
    allUrls.add(u);
  }
}
const allUrls = new Set();

// ---- plugins ----
const pluginsDir = join(root, "plugins");
const pluginDirs = readdirSync(pluginsDir).filter((d) => isDir(join(pluginsDir, d)));
if (!pluginDirs.length) fail("plugins/", "no plugins generated");
for (const name of pluginDirs) {
  const dir = join(pluginsDir, name);
  const where = `plugins/${name}`;
  // Agent Plugins manifest
  const pj = JSON.parse(read(join(dir, "plugin.json")));
  const out = [];
  check(pluginSchema, pj, "plugin.json", pluginSchema, out);
  out.forEach((o) => fail(where, o));
  if (pj.$schema !== facts.specs.pluginSchema) fail(where, "plugin.json $schema is not the pinned Agent Plugins 1.0.0 schema");
  if (pj.name !== name) fail(where, `plugin.json name "${pj.name}" != directory`);
  // Claude manifest
  const cj = JSON.parse(read(join(dir, ".claude-plugin", "plugin.json")));
  if (cj.name !== pj.name || cj.version !== pj.version || cj.description !== pj.description) fail(where, ".claude-plugin/plugin.json disagrees with plugin.json");
  // mcp.json
  if (existsSync(join(dir, "mcp.json"))) {
    const mj = JSON.parse(read(join(dir, "mcp.json")));
    const o2 = [];
    check(mcpSchema, mj, "mcp.json", mcpSchema, o2);
    o2.forEach((o) => fail(where, o));
    if (mj.$schema !== facts.specs.mcpSchema) fail(where, "mcp.json $schema is not the pinned schema");
    for (const [k, s] of Object.entries(mj.mcpServers)) {
      if (s.type === "stdio" && (typeof s.command !== "string" || !Array.isArray(s.args))) fail(where, `mcp.json server ${k}: stdio needs command + args`);
      if ((s.type === "streamable-http" || s.type === "sse") && !/^https:\/\//.test(s.url ?? "")) fail(where, `mcp.json server ${k}: remote url must be https`);
      if (s.type === "stdio" && s.args.some((a) => a.includes(facts.verifier.npm)) && !s.args.some((a) => a === `${facts.verifier.npm}@${facts.verifier.version}`)) fail(where, `verifier must be pinned to ${facts.verifier.version}`);
    }
    const dot = JSON.parse(read(join(dir, ".mcp.json")));
    if (JSON.stringify(Object.keys(dot.mcpServers)) !== JSON.stringify(Object.keys(mj.mcpServers))) fail(where, ".mcp.json servers differ from mcp.json");
  }
  // skills
  const skillsDir = join(dir, "skills");
  const skills = isDir(skillsDir) ? readdirSync(skillsDir).filter((s) => isDir(join(skillsDir, s))) : [];
  if (!skills.length) fail(where, "no skills");
  for (const s of skills) {
    const sw = `${where}/skills/${s}`;
    const md = read(join(skillsDir, s, "SKILL.md"));
    const fm = md.match(/^---\n([\s\S]*?)\n---\n/);
    if (!fm) { fail(sw, "SKILL.md has no frontmatter"); continue; }
    const nameLine = fm[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
    const descLine = fm[1].match(/^description:\s*(.+)$/m)?.[1]?.trim();
    if (nameLine !== s) fail(sw, `frontmatter name "${nameLine}" != directory`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) || s.length > 64) fail(sw, "skill name violates Agent Skills naming rules");
    if (!descLine || descLine.length > 1024) fail(sw, "description missing or > 1024 chars");
    const body = md.slice(fm[0].length);
    if (body.split("\n").length > 500) fail(sw, "SKILL.md body over 500 lines");
    assertedClaims(md).forEach((c) => fail(sw, `asserted forbidden claim ${c}`));
    checkUrls(sw, md);
    const script = join(skillsDir, s, "scripts", "review.mjs");
    if (existsSync(script)) {
      try { execFileSync(process.execPath, ["--check", script], { stdio: "pipe" }); } catch (e) { fail(sw, `review.mjs does not parse: ${String(e.stderr || e).slice(0, 200)}`); }
      // must never open a file or touch the network
      const src = read(script);
      for (const bad of ["readFileSync(", "openSync(", "createReadStream(", "fetch(", "node:https", "node:http", "node:net", "writeFileSync("]) if (src.includes(bad)) fail(sw, `review.mjs contains ${bad}`);
      // runs on an empty temp dir and yields a Review Priority
      try {
        const { mkdtempSync } = await import("node:fs");
        const { tmpdir } = await import("node:os");
        const tmp = mkdtempSync(join(tmpdir(), "eczid-plugin-"));
        const outText = execFileSync(process.execPath, [script, tmp], { encoding: "utf8" });
        if (!/## Review Priority: (LOW|NORMAL|ELEVATED|HIGH)/.test(outText)) fail(sw, "review.mjs produced no Review Priority");
        assertedClaims(outText).forEach((c) => fail(sw, `review output asserts forbidden claim ${c}`));
        const j = JSON.parse(execFileSync(process.execPath, [script, tmp, "--json"], { encoding: "utf8" }));
        if (!j.review_priority?.level || j.contextual_next_actions.length > 3) fail(sw, "review.mjs --json malformed or > 3 actions");
      } catch (e) { fail(sw, `review.mjs failed to run: ${String(e.message).slice(0, 200)}`); }
    }
  }
  // README + manifests: claims and URLs
  const readme = read(join(dir, "README.md"));
  assertedClaims(readme).forEach((c) => fail(where, `README asserts forbidden claim ${c}`));
  checkUrls(where, readme);
  checkUrls(where, JSON.stringify(pj));
  assertedClaims(pj.description).forEach((c) => fail(where, `description asserts forbidden claim ${c}`));
}

// ---- marketplaces ----
const claudeMp = JSON.parse(read(join(root, ".claude-plugin", "marketplace.json")));
const copilotMp = JSON.parse(read(join(root, ".github", "plugin", "marketplace.json")));
for (const [label, mp] of [["claude", claudeMp], ["copilot", copilotMp]]) {
  if (mp.name !== facts.organisation.marketplaceName) fail(`marketplace/${label}`, "wrong marketplace name");
  if (!mp.owner?.name) fail(`marketplace/${label}`, "owner.name missing");
  const names = mp.plugins.map((p) => p.name).sort();
  if (JSON.stringify(names) !== JSON.stringify([...pluginDirs].sort())) fail(`marketplace/${label}`, `plugin list ${names} != generated ${pluginDirs}`);
  for (const p of mp.plugins) {
    const pj = JSON.parse(read(join(pluginsDir, p.name, "plugin.json")));
    if (p.version !== pj.version || p.description !== pj.description) fail(`marketplace/${label}`, `${p.name} entry disagrees with its plugin.json`);
    if (label === "claude" && p.source !== `./plugins/${p.name}`) fail(`marketplace/${label}`, `${p.name} source must be ./plugins/${p.name}`);
    if (label === "copilot" && (p.source?.source !== "github" || p.source?.path !== `plugins/${p.name}` || p.source?.repo !== facts.organisation.estateRepo)) fail(`marketplace/${label}`, `${p.name} github source malformed`);
  }
  checkUrls(`marketplace/${label}`, JSON.stringify(mp));
}
const RESERVED = ["claude-code-marketplace", "claude-code-plugins", "claude-plugins-official", "claude-plugins-community", "anthropic-marketplace", "anthropic-plugins", "agent-skills"];
if (RESERVED.includes(facts.organisation.marketplaceName)) fail("marketplace", "reserved marketplace name");

// ---- live URLs ----
if (LIVE) {
  const ACCEPT_STATUS = { "www.npmjs.com": [403], "trust-mcp.ecocitizenz.com": [405] };
  for (const u of [...allUrls].sort()) {
    try {
      const res = await fetch(u, { method: "GET", redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 eczid-plugin-foundry" } });
      const host = new URL(u).hostname;
      const ok = res.status < 400 || (ACCEPT_STATUS[host] ?? []).includes(res.status);
      if (!ok) fail("live", `${u} -> ${res.status}`);
    } catch (e) { fail("live", `${u} -> ${e.message}`); }
  }
  console.log(`live-checked ${allUrls.size} URLs`);
}

if (findings.length) { console.error(`FAIL (${findings.length})`); for (const f of findings) console.error(" - " + f); process.exit(1); }
console.log(`PASS: ${pluginDirs.length} plugins, 2 marketplaces, ${allUrls.size} distinct URLs (${LIVE ? "live-checked" : "static"})`);
