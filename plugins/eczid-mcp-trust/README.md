# ECZ-ID MCP Trust (agent plugin)

See what the MCP servers configured in a workspace expose: which servers are declared, how they launch, which environment key names look credential-shaped, and whether any ECZ-ID public proof reference exists. Inspection only: OBSERVED, never ENFORCED. Free.

Free. Local-first. Read-only. No source upload. No telemetry. Part of the ECZ-ID Machine Trust plugin estate: https://github.com/Ecocitizenz/eczid-agent-plugins

## What it does

- Skill `mcp-trust-review` runs a portable, filename-and-path-only evidence review (`scripts/review.mjs`) and reports EVIDENCE OBSERVED / NOT OBSERVED, a deterministic Review Priority (LOW / NORMAL / ELEVATED / HIGH) with the reasons, why each class matters and what to review next, plus at most three contextual next actions.
- Evidence classes: MCP server configuration; MCP server manifest (server.json / registry entry); Environment / secret-handling template; Local MCP policy / allowlist; ECZ-ID public proof reference.
- MCP server `ecz-id-verifier`: `@ecocitizenz/ecz-id-mcp-verifier@0.9.0` over stdio, three read-only tools (ecz_check_target, ecz_explain_result, ecz_recheck_resolver). Launched by the host with npx; nothing is installed globally.

## Install

**Claude Code**

```
/plugin marketplace add Ecocitizenz/eczid-agent-plugins
/plugin install eczid-mcp-trust@eczid-plugins
```

**VS Code and GitHub Copilot**: add `Ecocitizenz/eczid-agent-plugins` to the `chat.plugins.marketplaces` setting, or run `Chat: Install Plugin From Source` with `https://github.com/Ecocitizenz/eczid-agent-plugins`. Copilot CLI reads the same marketplace.

**Cursor, Codex CLI, Gemini CLI, Kiro and any Agent Skills host**: copy this plugin directory (or just `skills/`) into the host's skills location and add the `mcp.json` server entry to the host's MCP configuration. The package is an Agent Plugins 1.0.0 plugin (`plugin.json`, `skills/`, `mcp.json`).

## The same capability in VS Code

**ECZ-ID MCP Trust** for VS Code carries the same detectors, guidance and Review Priority, plus a shareable evidence summary and a local JSON + Markdown report: https://marketplace.visualstudio.com/items?itemName=ecocitizenz.eczid-mcp-trust (Open VSX: https://open-vsx.org/extension/ecocitizenz/eczid-mcp-trust). Product page: https://developers.ecocitizenz.com/mcp-trust/

### Editions (VS Code extension)

- **MCP Trust Community**: £0. Free forever. Local-first MCP discovery, posture inspection, credential-shaped key-name visibility and change detection, with no account and no telemetry.
- **MCP Trust Pro**: £12.99/month or £119/year. Retained history, deeper tool and schema change detection, reduced credential exposure, deterministic local policy, and optional local mediation.
- **Developer Trust Pro**: £19.99/month or £199/year. MCP Trust Pro and Agent Trust Pro under one licence. Activate: https://trustops.ecocitizenz.com/developer-trust/activate

An existing MCP Trust Pro, Agent Trust Pro or Developer Trust Pro entitlement covers the VS Code extensions. No plugin sells a separate subscription and no plugin claims a Pro capability its host cannot genuinely provide.

**Capability parity, stated plainly:** this plugin inspects and routes in whatever host runs it. Mediation (the Local Trust Gate), retained history (Trust Epochs) and the other Pro capabilities run only in the VS Code extension. A plugin host cannot provide them, so this plugin does not claim them.

## Next actions it may offer (at most three per result)

- Free: ECZ-ID MCP Trust for VS Code (Community): https://marketplace.visualstudio.com/items?itemName=ecocitizenz.eczid-mcp-trust
- Free ECZ-ID MCP Passport: https://mcp.ecocitizenz.com/
- MCP Server & Tool Trust guidance: https://developers.ecocitizenz.com/mcp/
- MCP Trust Pro or Developer Trust Pro (VS Code): https://developers.ecocitizenz.com/developer-trust/
- MCP Server & Tool Trust in TrustOps: https://trustops.ecocitizenz.com/start?flow=mcp
- View all ECZ-ID MCP and agent products: https://developers.ecocitizenz.com/mcp/

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

## Links

- Documentation: https://developers.ecocitizenz.com
- Resolver (read-only public proof): https://resolver.ecocitizenz.org
- TrustOps (setup and checkout): https://trustops.ecocitizenz.com/start
- Questions: https://developers.ecocitizenz.com/faq/

Generated by the ECZ-ID Plugin Foundry. Agent Plugins 1.0.0. License: MIT (the Verifier package carries its own licence).
