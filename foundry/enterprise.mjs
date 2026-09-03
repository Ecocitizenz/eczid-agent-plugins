#!/usr/bin/env node
// ECZ-ID Plugin Foundry: managed-distribution assets for enterprise administrators.
//
// Deliberately small. An admin who wants the estate available to a fleet needs three
// standards-based files and nothing else, so this generates exactly those from the same
// facts as every other host rather than inventing a distribution system:
//
//  1. Claude Code managed settings (endpoint-managed settings file, or MDM / gateway policy):
//     extraKnownMarketplaces pre-populates the marketplace, enabledPlugins turns the six on.
//  2. Claude Code project settings (.claude/settings.json), for a single repository or team
//     that wants the estate without a fleet-wide policy.
//  3. VS Code / GitHub Copilot workspace or profile settings, using the same marketplace.
//
// Nothing here restricts what else an organisation may install: strictKnownMarketplaces is
// documented in the README as the admin's own decision, never pre-set by a vendor.
//
// Usage: node foundry/enterprise.mjs [--out <dir>]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const facts = JSON.parse(readFileSync(join(here, "product-facts.json"), "utf8"));
const defs = JSON.parse(readFileSync(join(here, "plugins.json"), "utf8"));

const outArg = process.argv.indexOf("--out");
const OUT = outArg > 0 ? resolve(process.argv[outArg + 1]) : join(root, "dist", "enterprise");
const posix = (p) => p.split("\\").join("/");

const MARKETPLACE = facts.organisation.marketplaceName;
const SOURCE = { source: "github", repo: facts.organisation.estateRepo };

const enabledPlugins = Object.fromEntries(defs.plugins.map((p) => [`${p.id}@${MARKETPLACE}`, true]));
const knownMarketplaces = { [MARKETPLACE]: { source: SOURCE } };

/** Claude Code managed settings: endpoint-managed file, MDM profile or gateway policy. */
const managedSettings = { extraKnownMarketplaces: knownMarketplaces, enabledPlugins };

/** Claude Code project settings: one repository, applied when the folder is trusted. */
const projectSettings = { extraKnownMarketplaces: knownMarketplaces, enabledPlugins };

/** VS Code and GitHub Copilot: the same marketplace, as a workspace or profile setting. */
const vscodeSettings = { "chat.plugins.marketplaces": [facts.organisation.estateRepo] };

function readme() {
  const L = [];
  L.push("# ECZ-ID Machine Trust: managed distribution for administrators", "");
  L.push("GENERATED — DO NOT HAND EDIT. Source: `foundry/enterprise.mjs` in " + facts.organisation.estateUrl + ". Regenerate with `npm run enterprise`.", "");
  L.push(`All six plugins are free and ${facts.organisation.license}-licensed. There is no licence key, no seat count, no activation and no per-user entitlement to provision: rolling the estate out to a fleet is a settings change and nothing else.`, "");
  L.push("## 1. Claude Code, fleet-wide (`managed-settings.json`)", "");
  L.push("Pre-populates the marketplace and enables all six plugins. Deliver it as an endpoint-managed settings file, an MDM profile, or a Claude apps gateway policy:", "");
  L.push("| Platform | Path |", "|---|---|");
  L.push("| macOS | `~/Library/Application Support/Claude/managed-settings.json` |");
  L.push("| Windows | `%APPDATA%\Claude\managed-settings.json` |");
  L.push("| Linux | `~/.config/Claude/managed-settings.json` |", "");
  L.push("File: `claude-code/managed-settings.json`", "");
  L.push("Team and Enterprise plans can do the same through **Organization settings > Plugins** at https://claude.ai/admin-settings/plugins", "");
  L.push("## 2. Claude Code, one repository (`.claude/settings.json`)", "");
  L.push("Commit this into a repository so everyone who trusts the folder gets the estate, with no fleet policy involved. File: `claude-code/project-settings.json` — copy it to `.claude/settings.json`.", "");
  L.push("## 3. VS Code and GitHub Copilot", "");
  L.push("Add the marketplace to a workspace, user or profile settings file. File: `vscode/settings.json`", "");
  L.push("## Restricting what else can be installed", "");
  L.push("`strictKnownMarketplaces` turns the known-marketplace list into an allowlist, and `blockedMarketplaces` blocks named ones. Both are an administrator's decision about their own estate, so neither is pre-set here — a vendor should not ship a policy that narrows what its customers may install. Add ECZ-ID to an existing allowlist with:", "");
  L.push("```json", JSON.stringify({ strictKnownMarketplaces: [SOURCE] }, null, 2), "```", "");
  L.push("## What administrators are approving", "");
  for (const d of facts.doctrine) L.push(`- ${d}`);
  L.push("");
  L.push(`- Every plugin is read-only: reviews read file names and paths, open no file and make no network call. The one MCP server (\`${facts.verifier.npm}\`, pinned to ${facts.verifier.version}) reads public Resolver posture only.`);
  L.push("- No telemetry, no source upload, no account and no sign-in.", "");
  L.push(`Documentation: ${facts.urls.gateway} · Questions: ${facts.organisation.supportUrl}`, "");
  return L.join("\n");
}

const files = [
  ["claude-code/managed-settings.json", JSON.stringify(managedSettings, null, 2) + "\n"],
  ["claude-code/project-settings.json", JSON.stringify(projectSettings, null, 2) + "\n"],
  ["vscode/settings.json", JSON.stringify(vscodeSettings, null, 2) + "\n"],
  ["README.md", readme()]
];

export function buildEnterprise({ outDir = OUT, write = true } = {}) {
  if (write) {
    for (const [name, data] of files) {
      const p = join(outDir, name);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, data);
    }
  }
  // The contents come back with the result so callers (and the tests) never have to read
  // dist/, which is generated and not committed.
  return { files: Object.fromEntries(files), enabledPlugins, marketplace: MARKETPLACE };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const b = buildEnterprise();
  for (const f of Object.keys(b.files)) console.log(`  ${f}`);
  console.log(`enterprise managed-distribution assets -> ${posix(relative(root, OUT))}/`);
}
