#!/usr/bin/env node
// ECZ-ID Plugin Foundry: Gemini CLI extension.
//
// Gemini CLI's gallery crawler indexes PUBLIC GitHub repositories carrying the topic
// `gemini-cli-extension`, and requires `gemini-extension.json` at the ABSOLUTE ROOT of
// the repository or of a release archive. One repository is therefore one extension and
// one gallery entry, so the whole estate ships as a single extension rather than six.
// Skills are auto-discovered at `skills/<skill-name>/SKILL.md` relative to the extension
// root; no manifest field declares them.
//
// Everything here is generated from the same plugins/ tree as every other host, so the
// estate stays canonical: no forked source trees, nothing hand-maintained.
//
// Usage: node foundry/gemini.mjs [--out <dir>]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { zipWrite } from "./zip.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const facts = JSON.parse(readFileSync(join(here, "product-facts.json"), "utf8"));
const defs = JSON.parse(readFileSync(join(here, "plugins.json"), "utf8"));

export const EXTENSION_NAME = "eczid-machine-trust";
const outArg = process.argv.indexOf("--out");
const OUT = outArg > 0 ? resolve(process.argv[outArg + 1]) : join(root, "dist", "gemini");

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
const posix = (p) => p.split("\\").join("/");

/**
 * The dedicated distribution repository. Gemini CLI requires gemini-extension.json at the
 * ABSOLUTE ROOT of the repository and auto-discovers skills at skills/<name>/SKILL.md
 * relative to that root. The canonical estate keeps its skills under plugins/<id>/skills/,
 * and its root already declares an Agent Plugins marketplace, so a root manifest there
 * would either duplicate every skill or make one repository root assert two package
 * identities. This repository is generated output only: it is NOT a second source of truth.
 */
export const DISTRIBUTION_REPO = "Ecocitizenz/eczid-machine-trust-gemini";
export const GENERATION_COMMAND = "npm run gemini";

/** The canonical estate commit this extension was generated from. */
export function sourceCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/** The provenance banner every generated distribution surface carries, verbatim. */
function provenance(commit) {
  return [
    "GENERATED — DO NOT HAND EDIT",
    "",
    `- Canonical source repo: ${facts.organisation.estateUrl}`,
    `- Canonical source commit: ${commit ?? "unknown (not generated from a git checkout)"}`,
    `- Generation command: ${GENERATION_COMMAND} (in the canonical source repo)`,
    "",
    "Every file in this repository is written by the ECZ-ID Plugin Foundry from the canonical",
    "estate above. Edits made here are overwritten by the next generation and are not the",
    "source of truth. Open issues and pull requests against the canonical source repo."
  ];
}

/** The context file Gemini CLI loads for every session in a workspace using this extension. */
function contextFile() {
  const L = [`# ECZ-ID Machine Trust`, "", facts.organisation.marketplaceDescription, "", "## Doctrine", ""];
  for (const d of facts.doctrine) L.push(`- ${d}`);
  L.push("", "## Skills in this extension", "");
  for (const def of defs.plugins) L.push(`- \`${def.skills.join("`, `")}\` — ${def.displayName}: ${def.openai.subtitle}.`);
  L.push("", `Documentation: ${facts.urls.gateway}`, "");
  return L.join("\n");
}

function readme(commit) {
  const p = provenance(commit);
  const L = [`# ECZ-ID Machine Trust — Gemini CLI extension`, ""];
  L.push(`> **${p[0]}**`, ">");
  for (const line of p.slice(2)) L.push(line ? `> ${line}` : ">");
  L.push("", facts.organisation.marketplaceDescription, "");
  L.push("## Free. No purchase required.", "");
  L.push(`Every skill in this extension is free and open source under the ${facts.organisation.license} licence. No account, no sign-in, no licence key, no trial and no paywall. The paid ECZ-ID products (VS Code Pro editions, TrustOps Passports and tiers) are separate products that this extension does not sell, unlock or require.`, "");
  L.push("## Install", "", "```", `gemini extensions install https://github.com/${DISTRIBUTION_REPO}`, "```", "");
  L.push("Gemini CLI reads `gemini-extension.json` at the root of this repository and auto-discovers every skill at `skills/<name>/SKILL.md`. The extension configures one pinned, read-only stdio MCP server (`" + facts.verifier.npm + "@" + facts.verifier.version + "`), launched with npx; nothing is installed globally.", "");
  L.push("## Skills", "", "| Skill | Product | What it answers |", "|---|---|---|");
  for (const def of defs.plugins) {
    L.push(`| \`${def.skills[0]}\` | ${def.displayName} | ${def.openai.subtitle} |`);
  }
  L.push("", "## What every skill does and does not do", "");
  for (const d of facts.doctrine) L.push(`- ${d}`);
  L.push("", "## Other hosts", "", `Claude Code, VS Code, GitHub Copilot, Cursor, Codex CLI and Kiro install the same skills as Agent Plugins 1.0.0 packages from the canonical estate: ${facts.organisation.estateUrl}`, "");
  L.push(`Licence: ${facts.organisation.license}. The ECZ-ID Verifier npm package carries its own licence.`, "");
  return L.join("\n");
}

/** @returns {{name: string, data: Buffer}[]} extension files, manifest first, archive order. */
export function stageExtension({ commit = sourceCommit() } = {}) {
  const entries = [];
  const add = (name, data) => entries.push({ name, data: Buffer.isBuffer(data) ? data : Buffer.from(data) });

  // One stdio MCP server, the same pinned read-only Verifier every other host gets.
  const mcpServers = {
    [`ecz-id-verifier`]: {
      command: "npx",
      args: ["-y", `${facts.verifier.npm}@${facts.verifier.version}`, facts.verifier.stdioBin]
    }
  };
  add("gemini-extension.json", JSON.stringify({
    name: EXTENSION_NAME,
    version: defs.version,
    description: facts.organisation.marketplaceDescription,
    contextFileName: "GEMINI.md",
    mcpServers
  }, null, 2) + "\n");
  add("GEMINI.md", contextFile());
  add("README.md", readme(commit));
  add("GENERATED.json", JSON.stringify({
    generated: true,
    doNotHandEdit: true,
    canonicalSourceRepo: facts.organisation.estateUrl,
    canonicalSourceCommit: commit,
    generationCommand: GENERATION_COMMAND,
    distributionRepo: `https://github.com/${DISTRIBUTION_REPO}`,
    note: "Generated output of the ECZ-ID Plugin Foundry. Not a source of truth. Edits here are overwritten by the next generation."
  }, null, 2) + "\n");
  add("LICENSE.md", readFileSync(join(root, "LICENSE.md")));

  const seen = new Set();
  for (const def of defs.plugins) {
    for (const skill of def.skills) {
      if (seen.has(skill)) throw new Error(`two plugins ship a skill named "${skill}"; skills are flattened into one extension`);
      seen.add(skill);
      const sdir = join(root, "plugins", def.id, "skills", skill);
      for (const f of listFilesUnder(sdir)) {
        const rel = posix(relative(sdir, f));
        // agents/openai.yaml is the OpenAI listing interface; it has no meaning here.
        if (rel === "agents/openai.yaml") continue;
        add(`skills/${skill}/${rel}`, readFileSync(f));
      }
    }
  }
  return entries;
}

export function buildExtension({ outDir = OUT, write = true, commit = sourceCommit() } = {}) {
  const entries = stageExtension({ commit });
  const buf = zipWrite(entries);
  if (write) {
    const dir = join(outDir, EXTENSION_NAME);
    rmSync(dir, { recursive: true, force: true });
    for (const e of entries) {
      const p = join(dir, e.name);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, e.data);
    }
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${EXTENSION_NAME}.zip`), buf);
  }
  return {
    name: EXTENSION_NAME,
    version: defs.version,
    commit,
    dir: join(outDir, EXTENSION_NAME),
    zip: join(outDir, `${EXTENSION_NAME}.zip`),
    bytes: buf.length,
    sha256: createHash("sha256").update(buf).digest("hex"),
    entries: entries.map((e) => e.name)
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const b = buildExtension();
  console.log(`${b.name} ${b.version}: ${b.entries.length} files, ${b.bytes} bytes, sha256 ${b.sha256.slice(0, 16)}…`);
  console.log(`  directory: ${posix(relative(root, b.dir))}/`);
  console.log(`  archive:   ${posix(relative(root, b.zip))}  (gemini-extension.json at the archive root)`);
}
