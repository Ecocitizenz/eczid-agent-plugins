#!/usr/bin/env node
// ECZ-ID Plugin Foundry: OpenAI plugin-directory submission packages.
//
// One deterministic path for every plugin. The archive is assembled from the
// generated plugins/ tree (never hand-edited) and written by foundry/zip.mjs, so
// archive paths are always POSIX and the bytes are reproducible.
//
// Two deliberate transforms, both learned from the accepted eczid-sbom-cra-readiness
// 0.1.1 submission and both asserted by foundry/openai-preflight.mjs:
//
//  1. SKILL.md frontmatter is reduced to name / description / license. The accepted
//     package carried no `metadata:` block, so the submission copy does not either.
//  2. `mcpServers` is dropped from the submitted manifest and no mcp.json is included.
//     OpenAI's plugin review requires a public production MCP server URL with a
//     /.well-known/openai-apps-challenge token on that host. The ECZ-ID Verifier is a
//     local read-only stdio server launched by npx and has no public MCP URL, so an
//     MCP submission cannot truthfully be made. These are skills-only submissions;
//     the stdio server stays in the canonical plugin for hosts that run it.
//
// Usage: node foundry/openai.mjs [--out <dir>]
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { zipWrite, zipRead } from "./zip.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const defs = JSON.parse(readFileSync(join(here, "plugins.json"), "utf8"));

const outArg = process.argv.indexOf("--out");
export const DEFAULT_OUT = join(root, "dist", "openai");
const OUT = outArg > 0 ? resolve(process.argv[outArg + 1]) : DEFAULT_OUT;

/** Frontmatter keys an OpenAI SKILL.md carries, in the order the accepted package used. */
const SKILL_FRONTMATTER_KEYS = ["name", "description", "license"];

/** Reduce SKILL.md frontmatter to the keys OpenAI's accepted package carried. */
export function submissionSkillMd(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) throw new Error("SKILL.md has no frontmatter");
  const kept = [];
  for (const key of SKILL_FRONTMATTER_KEYS) {
    // Top-level scalar keys only; a nested block (metadata:) is dropped with its children.
    const line = m[1].split("\n").find((l) => l.startsWith(`${key}: `));
    if (!line) throw new Error(`SKILL.md frontmatter is missing "${key}"`);
    kept.push(line);
  }
  return `---\n${kept.join("\n")}\n---\n` + text.slice(m[0].length);
}

/** The manifest as submitted: skills-only, so no mcpServers and no mcp.json. */
export function submissionManifest(manifest) {
  const { mcpServers, ...rest } = manifest;
  return rest;
}

const listFilesUnder = (dir) => {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  if (existsSync(dir) && statSync(dir).isDirectory()) walk(dir);
  return out;
};

/**
 * Stage the archive entries for one plugin, in archive order.
 * @returns {{name: string, data: Buffer}[]}
 */
export function stagePlugin(pluginDir, def) {
  const entries = [];
  const add = (name, data) => entries.push({ name, data: Buffer.isBuffer(data) ? data : Buffer.from(data) });
  const rel = (...p) => join(pluginDir, ...p);

  const manifest = JSON.parse(readFileSync(rel(".codex-plugin", "plugin.json"), "utf8"));
  add(".codex-plugin/plugin.json", JSON.stringify(submissionManifest(manifest), null, 2) + "\n");
  // Plugin-root icon: interface.logo and interface.composerIcon resolve from here.
  add("assets/logo.png", readFileSync(rel("assets", "logo.png")));

  for (const skill of def.skills) {
    const sdir = rel("skills", skill);
    if (!existsSync(join(sdir, "SKILL.md"))) throw new Error(`${def.id}: skills/${skill}/SKILL.md is missing`);
    add(`skills/${skill}/SKILL.md`, submissionSkillMd(readFileSync(join(sdir, "SKILL.md"), "utf8")));
    add(`skills/${skill}/agents/openai.yaml`, readFileSync(join(sdir, "agents", "openai.yaml")));
    // Skill-root icon: icon_small / icon_large in agents/openai.yaml resolve from the SKILL
    // ROOT, so this is skills/<skill>/assets/logo.png and never skills/<skill>/agents/assets/.
    add(`skills/${skill}/assets/logo.png`, readFileSync(join(sdir, "assets", "logo.png")));
    for (const sub of ["references", "scripts"]) {
      for (const f of listFilesUnder(join(sdir, sub))) {
        add(`skills/${skill}/${sub}/${relative(join(sdir, sub), f).split("\\").join("/")}`, readFileSync(f));
      }
    }
  }
  return entries;
}

export function buildPackages({ outDir = DEFAULT_OUT, write = true, all = false } = {}) {
  const built = [];
  for (const def of defs.plugins) {
    // --all also packages plugins already published, so the pipeline can be shown to
    // reproduce an artefact OpenAI has actually accepted.
    if (!all && !def.openai?.submit) continue;
    const pluginDir = join(root, "plugins", def.id);
    const entries = stagePlugin(pluginDir, def);
    const buf = zipWrite(entries);
    // Read the archive back the way an extractor would: a package that cannot be
    // reopened here never reaches the output directory.
    const reread = zipRead(buf);
    if (reread.entries.length !== entries.length) throw new Error(`${def.id}: archive re-read entry count mismatch`);
    const file = join(outDir, `${def.id}-openai-SUBMISSION-READY.zip`);
    if (write) {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(file, buf);
    }
    built.push({
      id: def.id,
      displayName: def.displayName,
      version: defs.version,
      file,
      bytes: buf.length,
      sha256: createHash("sha256").update(buf).digest("hex"),
      entries: entries.map((e) => e.name)
    });
  }
  return built;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const built = buildPackages({ outDir: OUT, all: process.argv.includes("--all") });
  for (const b of built) console.log(`${b.id.padEnd(24)} ${String(b.bytes).padStart(7)} bytes  ${b.entries.length} entries  ${b.sha256.slice(0, 16)}…`);
  console.log(`built ${built.length} OpenAI submission packages -> ${relative(root, OUT).split("\\").join("/")}/`);
}
