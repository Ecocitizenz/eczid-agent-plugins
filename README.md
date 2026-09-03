# ECZ-ID Machine Trust plugins

Free, local-first, read-only plugins that bring ECZ-ID evidence reviews and Resolver posture checks into the agent you already use. One repository is the canonical estate and the marketplace: every plugin here is an **Agent Plugins 1.0.0** package (`plugin.json`, `skills/`, `mcp.json`) that also carries the Claude Code manifest, so it installs in Claude Code, VS Code, GitHub Copilot and any host that reads Agent Skills.

No sign-in. No source upload. No telemetry. No scores. Evidence, ReasonCodes and a deterministic Review Priority with the reasons shown.

## Plugins

| Plugin | What it answers | Composes |
|---|---|---|
| `eczid-mcp-verifier` | Does this MCP server, agent, API, package, domain or business have public ECZ-ID Resolver proof? | `@ecocitizenz/ecz-id-mcp-verifier` (stdio MCP server, three read-only tools) |
| `eczid-mcp-trust` | What can the MCP servers in this workspace reach, and what has public proof? | Portable review script + Verifier; same detectors as ECZ-ID MCP Trust for VS Code |
| `eczid-agent-trust` | What can this agent reach, who authorised it, and what has public proof? | Portable review script + Verifier; same doctrine as ECZ-ID Agent Trust for VS Code |
| `eczid-sbom-cra-readiness` | Could your team identify an affected component and its evidence chain within the CRA reporting window? | The exact detectors, guidance and Review Priority of ECZ-ID SBOM & CRA Readiness 0.3.0 |
| `eczid-api-trust` | Which API surfaces does this workspace expose, how are they secured, and what has public proof? | Portable review script + Verifier |
| `eczid-dora-readiness` | Can you produce your ICT third-party evidence today? | The exact detectors, guidance and Review Priority of ECZ-ID DORA Readiness 0.3.0 |

## Install

**Claude Code**

```
/plugin marketplace add Ecocitizenz/eczid-agent-plugins
/plugin install eczid-dora-readiness@eczid-plugins
```

**VS Code and GitHub Copilot**: add `Ecocitizenz/eczid-agent-plugins` to the `chat.plugins.marketplaces` setting (or `extraKnownMarketplaces` for a team), then install from the Extensions view (`@agentPlugins`) or run `Chat: Install Plugin From Source` with `https://github.com/Ecocitizenz/eczid-agent-plugins`. Copilot CLI reads the same `.github/plugin/marketplace.json`.

**Cursor, Codex CLI, Gemini CLI, Kiro and other Agent Skills hosts**: copy a plugin's `skills/` directory into the host's skills location and, where the plugin ships `mcp.json`, add its server entry to the host's MCP configuration. Skills are plain `SKILL.md` files; review scripts are dependency-free Node scripts.

## What every plugin does and does not do

- Reviews read file **names and paths** in the workspace you point them at. No file is opened, no SBOM is parsed, no secret value is read, nothing is written unless you redirect the JSON yourself.
- The Verifier MCP server reads **public** Resolver posture only, sends no telemetry, and is pinned to an exact version in every `mcp.json`.
- Results use EVIDENCE OBSERVED / EVIDENCE NOT OBSERVED / REVIEW RECOMMENDED / REVIEW REQUIRED and a Review Priority of LOW / NORMAL / ELEVATED / HIGH. Never a score, never a verdict. Missing evidence is neutral; local policy decides; re-check before reliance.
- OBSERVED is not ENFORCED. No plugin mediates traffic; the ECZ-ID Local Trust Gate that produces ENFORCED runs only in the VS Code extension.
- Plugins inspect, explain and route. TrustOps handles any setup or checkout; the Resolver proves public state; the Developer Gateway documents. No plugin writes truth, activates proof or grants entitlement.

## Commercial doctrine

Plugins are free acquisition surfaces. Where an ECZ-ID product has Community and Pro editions (MCP Trust, Agent Trust, Developer Trust Pro), those editions belong to the VS Code extensions and an existing licence already covers them; no plugin sells a separate subscription, and no plugin claims a Pro capability its host cannot genuinely provide. Where a free Passport exists (MCP Passport, Agent Passport) the relevant plugin offers it in context; nothing is offered for products that are not live.

## Foundry

`foundry/` generates everything from shared facts:

- `product-facts.json`: organisation, routes, Verifier identity, editions and tiers (with the date they were read from TrustOps), Passport availability, doctrine, forbidden claims, allowed link hosts.
- `plugins.json`: the plugin definitions, including the MCP / agent / API review detectors and guidance.
- `facts/*.json`: DORA and SBOM & CRA specs and value profiles synced from the released VS Code extensions (`npm run sync -- <monorepo worktree>`).
- `review-engine.mjs`: the portable evidence engine (same rules as the extensions' family layer).
- `build.mjs` / `validate.mjs` / `test/`: generate, validate against the pinned Agent Plugins 1.0.0 schemas and the Agent Skills rules, scan every public surface for asserted forbidden claims, check every URL, and prove parity.
- `zip.mjs` / `openai.mjs` / `openai-preflight.mjs` / `openai-clicksheet.mjs`: build, gate and document the OpenAI plugin-directory submission archives (below).
- `gemini.mjs`: build the Gemini CLI extension (`npm run gemini`) — one extension covering every skill, with `gemini-extension.json` at the root of the generated directory and archive.

```
npm run check          # build + validate + test
npm run validate:live  # also fetches every URL the plugins link to
npm run openai:release # build + validate + test + package for OpenAI + preflight
```

CI fails if the committed `plugins/` or marketplace files drift from the generator, or if any OpenAI submission package fails preflight.

## OpenAI plugin directory

`npm run openai` writes one submission archive per plugin to `dist/openai/`, assembled from the generated `plugins/` tree by `foundry/zip.mjs`. The writer emits POSIX archive paths and a fixed timestamp, so the packages are reproducible and the Windows-separator failure that blocked the first submission cannot recur.

The rules the accepted `eczid-sbom-cra-readiness` 0.1.1 submission proved, all now generated and all enforced by `npm run openai:preflight`:

- `.codex-plugin/plugin.json` is the manifest; `interface.logo` and `interface.composerIcon` must resolve **from the plugin root** to a square PNG (logo at least 256x256, composer icon at least 48x48).
- Skills live at `skills/<skill-name>/SKILL.md`, and the frontmatter `name` must equal the folder name.
- The OpenAI skill interface is `skills/<skill-name>/agents/openai.yaml`, and its `icon_small` / `icon_large` resolve **from the skill root** — so the asset is `skills/<skill-name>/assets/logo.png`, never `skills/<skill-name>/agents/assets/logo.png`.
- The public listing caps the display name and the subtitle at 30 characters each.

Two transforms are applied when packaging, and asserted by the preflight:

1. SKILL.md frontmatter is reduced to `name` / `description` / `license`, matching the accepted package.
2. `mcpServers` is dropped and no `mcp.json` is included. OpenAI's plugin review requires a public production MCP server URL with a `/.well-known/openai-apps-challenge` token on that host; the ECZ-ID Verifier is a local read-only stdio server launched by npx and has no public MCP URL, so these are **skills-only** submissions. The stdio server stays in the canonical plugin for hosts that run it, and `skills/ecz-id-verify` states plainly that its tools are present only where that server is configured.

Preflight is release-blocking: it opens each archive, verifies every entry's CRC, and fails the build on a non-POSIX, absolute, duplicate or traversing path, a missing or unparsable manifest, an icon that does not resolve or is not square and large enough, a skill name that disagrees with its folder, an unparsable `openai.yaml`, an over-length display name or subtitle, a referenced-but-absent file, a script that does not parse or run against a harmless fixture, an unsupported claim, a link to a host that is not allow-listed, or any MCP, secret or third-party-collector material in the archive.

## Links

- Documentation: https://developers.ecocitizenz.com
- Install routes for every surface: https://developers.ecocitizenz.com/install/
- Resolver (read-only public proof): https://resolver.ecocitizenz.org
- TrustOps (setup and checkout): https://trustops.ecocitizenz.com/start
- Questions: https://developers.ecocitizenz.com/faq/

License: MIT for this repository. The ECZ-ID MCP Verifier npm package carries its own licence. ECZ-ID is independent trust infrastructure; third-party names describe compatible ecosystems only and do not imply endorsement or affiliation.
