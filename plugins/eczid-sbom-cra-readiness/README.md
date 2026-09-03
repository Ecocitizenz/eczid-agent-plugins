# ECZ-ID SBOM & CRA Readiness (agent plugin)

CRA reporting obligations apply from 11 September 2026. Review whether a workspace holds the SBOM, VEX / CSAF, disclosure, provenance and release evidence needed to identify an affected component within the reporting window. Filename and path only. Free.

## Free agent plugin. No purchase required.

No account, no sign-in, no licence key, no trial and no paywall. Every capability described below works in full as soon as you install it, in whatever host you run it in, for free.

This plugin is open source under the MIT licence: https://github.com/Ecocitizenz/eczid-agent-plugins

Local-first. Read-only. No source upload. No telemetry. No score. Part of the ECZ-ID Machine Trust plugin estate.

## What it does

- Skill `sbom-cra-evidence-review` runs a portable, filename-and-path-only evidence review (`scripts/review.mjs`) and reports EVIDENCE OBSERVED / NOT OBSERVED, a deterministic Review Priority (LOW / NORMAL / ELEVATED / HIGH) with the reasons, why each class matters and what to review next, plus at most three contextual next actions.
- Evidence classes: Machine-readable SBOM (CycloneDX or SPDX); CycloneDX SBOM; SPDX SBOM; Dependency lockfile; VEX / CSAF vulnerability statements; Vulnerability disclosure policy / security contact; Build provenance / attestations; Release record (changelog / release notes / release workflow).

## Install

**Claude Code**

```
/plugin marketplace add Ecocitizenz/eczid-agent-plugins
/plugin install eczid-sbom-cra-readiness@eczid-plugins
```

**VS Code and GitHub Copilot**: add `Ecocitizenz/eczid-agent-plugins` to the `chat.plugins.marketplaces` setting, or run `Chat: Install Plugin From Source` with `https://github.com/Ecocitizenz/eczid-agent-plugins`. Copilot CLI reads the same marketplace.

**Cursor, Codex CLI, Gemini CLI, Kiro and any Agent Skills host**: copy this plugin directory (or just `skills/`) into the host's skills location. The package is an Agent Plugins 1.0.0 plugin (`plugin.json`, `skills/`).

Nothing in any of those routes asks for payment, an account or a key.

## What it may suggest next (at most three per result)

Free routes — free tools, free identity and documentation, nothing to buy:

- Free: add Dependency Security and CI/CD Trust: https://open-vsx.org/extension/ecocitizenz/eczid-dependency-security
- Read the SBOM & CRA guidance: https://developers.ecocitizenz.com/sbom/
- View all relevant SBOM / CRA products: https://developers.ecocitizenz.com/dora-sbom-suite/

Optional paid ECZ-ID routes, offered only where they fit the result. **None of these is required.** This plugin is complete without them, nothing it does is withheld until you buy one, and it never runs checkout, sells a subscription or grants entitlement itself:

- Cyber Resilience Passport (TrustOps): https://trustops.ecocitizenz.com/start?flow=critical-cyber-resilience
- Software Supply Chain Passport (TrustOps): https://trustops.ecocitizenz.com/start?flow=api-software
- Verified or Assured ECZ-ID: https://trustops.ecocitizenz.com/start#parent-tiers

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

## Optional: the same capability in the free VS Code extension

You do not need it — this plugin is complete on its own. **ECZ-ID SBOM & CRA Readiness** for VS Code is free as well, and carries the same detectors, guidance and Review Priority, plus a shareable evidence summary and a local JSON + Markdown report: https://marketplace.visualstudio.com/items?itemName=ecocitizenz.eczid-sbom-readiness (Open VSX: https://open-vsx.org/extension/ecocitizenz/eczid-sbom-readiness). Product page: https://developers.ecocitizenz.com/sbom/

## Links

- Documentation: https://developers.ecocitizenz.com
- Resolver (read-only public proof): https://resolver.ecocitizenz.org
- TrustOps (setup and checkout for the optional paid products above): https://trustops.ecocitizenz.com/start
- Questions: https://developers.ecocitizenz.com/faq/

Generated by the ECZ-ID Plugin Foundry. Agent Plugins 1.0.0. License: MIT (the Verifier package carries its own licence).
