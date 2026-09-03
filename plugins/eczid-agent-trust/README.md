# ECZ-ID Agent Trust (agent plugin)

See what the AI agents in a workspace can reach: agent manifests, instructions, declared tools, MCP servers, permission policy and public proof references. Inspection only. Free.

## Free agent plugin. No purchase required.

No account, no sign-in, no licence key, no trial and no paywall. Every capability described below works in full as soon as you install it, in whatever host you run it in, for free.

This plugin is open source under the MIT licence (the ECZ-ID Verifier npm package it launches carries its own licence): https://github.com/Ecocitizenz/eczid-agent-plugins

Local-first. Read-only. No source upload. No telemetry. No score. Part of the ECZ-ID Machine Trust plugin estate.

## What it does

- Skill `agent-trust-review` runs a portable, filename-and-path-only evidence review (`scripts/review.mjs`) and reports EVIDENCE OBSERVED / NOT OBSERVED, a deterministic Review Priority (LOW / NORMAL / ELEVATED / HIGH) with the reasons, why each class matters and what to review next, plus at most three contextual next actions.
- Evidence classes: Agent manifest / agent card; MCP servers the agent can reach; Permissions / allowlist policy; Agent instructions / rules; Declared tools / functions; Agent framework surface; ECZ-ID public proof reference.
- MCP server `ecz-id-verifier`: `@ecocitizenz/ecz-id-mcp-verifier@0.9.0` over stdio, three read-only tools (ecz_check_target, ecz_explain_result, ecz_recheck_resolver). Launched by the host with npx; nothing is installed globally.

## Install

**Claude Code**

```
/plugin marketplace add Ecocitizenz/eczid-agent-plugins
/plugin install eczid-agent-trust@eczid-plugins
```

**VS Code and GitHub Copilot**: add `Ecocitizenz/eczid-agent-plugins` to the `chat.plugins.marketplaces` setting, or run `Chat: Install Plugin From Source` with `https://github.com/Ecocitizenz/eczid-agent-plugins`. Copilot CLI reads the same marketplace.

**Cursor, Codex CLI, Gemini CLI, Kiro and any Agent Skills host**: copy this plugin directory (or just `skills/`) into the host's skills location and add the `mcp.json` server entry to the host's MCP configuration. The package is an Agent Plugins 1.0.0 plugin (`plugin.json`, `skills/`, `mcp.json`).

Nothing in any of those routes asks for payment, an account or a key.

## What it may suggest next (at most three per result)

Free routes — free tools, free identity and documentation, nothing to buy:

- Free: ECZ-ID Agent Trust for VS Code (Community): https://marketplace.visualstudio.com/items?itemName=ecocitizenz.eczid-ai-agents
- Free ECZ-ID Agent Passport: https://developers.ecocitizenz.com/agent-trust/
- Agent Identity & KYA guidance: https://developers.ecocitizenz.com/agents/
- View all ECZ-ID agent products: https://developers.ecocitizenz.com/agents/

Optional paid ECZ-ID routes, offered only where they fit the result. **None of these is required.** This plugin is complete without them, nothing it does is withheld until you buy one, and it never runs checkout, sells a subscription or grants entitlement itself:

- Agent Trust Pro or Developer Trust Pro (VS Code): https://developers.ecocitizenz.com/developer-trust/
- Agent Identity & KYA in TrustOps: https://trustops.ecocitizenz.com/start?flow=agent

## Doctrine

- Backend/Core writes canonical ECZ-ID truth. TrustOps owns acquisition, payment and entitlement. Resolver is the public read-only proof surface. The Developer Gateway documents and routes.
- This plugin inspects, explains and routes. It never writes truth, activates proof, marks anything bound, runs checkout or grants entitlement.
- OBSERVED is not ENFORCED. Nothing in a plugin mediates traffic; ENFORCED requires genuine mediation proof, which only the VS Code Local Trust Gate produces.
- No numeric safety, security or trust score. Results use evidence, ReasonCodes and Review Priority (LOW / NORMAL / ELEVATED / HIGH) with the reasons shown.
- Absence of public Resolver proof does not mean a target is unsafe. Local policy decides. Re-check before reliance.
- Local-first and privacy-first: reviews read filenames and paths in the workspace you point them at. No source, prompt, secret or tool payload is uploaded. No telemetry. Credential-shaped values are never displayed or recorded, only key names.

## Privacy

- Reviews read file names and paths only; no file is opened, no SBOM is parsed, no secret value is read.
- The Verifier MCP server, where configured, reads public Resolver posture only and sends no telemetry.
- Nothing is written to your workspace unless you ask for the JSON output and redirect it yourself.

## Optional and separate: ECZ-ID Agent Trust for VS Code (a different product)

**You do not need this to use this plugin, and this plugin is not a trial of it.** ECZ-ID Agent Trust is a separate product — a VS Code extension, not this plugin. Nothing in this plugin is locked, limited, time-limited or degraded because you do not have it, and this plugin sells nothing.

It carries the same detectors, guidance and Review Priority, plus a shareable evidence summary and a local JSON + Markdown report: https://marketplace.visualstudio.com/items?itemName=ecocitizenz.eczid-ai-agents (Open VSX: https://open-vsx.org/extension/ecocitizenz/eczid-ai-agents). Product page: https://developers.ecocitizenz.com/agent-trust/

### Editions of that VS Code extension (not of this plugin)

- **Agent Trust Community**: £0. Free forever. Local-first agent-surface discovery, declared tool and capability visibility, credential-shaped key-name visibility, workspace MCP relationships and change detection.
- **Agent Trust Pro**: £12.99/month or £119/year. Authority Graph, dangerous action-chain indicators, Authority Epochs, the reciprocal Agent to MCP view, and reviewable remediation.
- **Developer Trust Pro**: £19.99/month or £199/year. MCP Trust Pro and Agent Trust Pro under one licence. Activate: https://trustops.ecocitizenz.com/developer-trust/activate

An existing MCP Trust Pro, Agent Trust Pro or Developer Trust Pro entitlement covers the VS Code extensions. No plugin sells a separate subscription and no plugin claims a Pro capability its host cannot genuinely provide.

**Capability parity, stated plainly:** this plugin inspects and routes in whatever host runs it. Mediation (the Local Trust Gate), retained history (Trust Epochs) and the other Pro capabilities run only in the VS Code extension. A plugin host cannot provide them, so this plugin does not claim them — and it does not withhold anything it can do.

## Links

- Documentation: https://developers.ecocitizenz.com
- Resolver (read-only public proof): https://resolver.ecocitizenz.org
- TrustOps (setup and checkout for the optional paid products above): https://trustops.ecocitizenz.com/start
- Questions: https://developers.ecocitizenz.com/faq/
- Support: https://developers.ecocitizenz.com/plugins/agent-trust/support/
- Privacy policy: https://developers.ecocitizenz.com/plugins/agent-trust/privacy/
- Terms: https://developers.ecocitizenz.com/plugins/agent-trust/terms/

Generated by the ECZ-ID Plugin Foundry. Agent Plugins 1.0.0. License: MIT (the Verifier package carries its own licence).
