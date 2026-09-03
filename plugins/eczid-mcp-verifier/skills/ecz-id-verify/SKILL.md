---
name: ecz-id-verify
description: Check the public ECZ-ID Resolver posture of an MCP server, agent, API, package, domain or business with the read-only ECZ-ID Verifier tools, and explain ResultStates and ReasonCodes without scoring. Use when asked to check, verify or look up an ECZ-ID or public proof.
license: MIT
metadata:
  author: ecocitizenz
  version: "0.1.1"
  ecz-id-plugin: eczid-mcp-verifier
---
Use the three read-only ECZ-ID Verifier tools that this plugin configures (`@ecocitizenz/ecz-id-mcp-verifier@0.9.0`, stdio) whenever a task asks whether an MCP server, agent, API, package, domain or business has public ECZ-ID Resolver proof, or asks to "check", "verify" or "look up" an ECZ-ID.

## Tools

- `ecz_check_target` with `target` (an ECZ-ID such as `ECZ-GB-A93K7Q`, a URL, a domain, a package name or an MCP server name) and optional `policy` (`OPEN`, `PREFER` or `REQUIRE`). Returns a deterministic JSON result: `target_type`, `result_state`, `reason_codes`, `resolver_url`, routing fields and the boundary flags (`no_source_uploaded`, `no_secrets_uploaded`, `no_telemetry`).
- `ecz_explain_result` with a previous result. Returns the plain-English meaning of the ResultState and each ReasonCode.
- `ecz_recheck_resolver` with the same target. Re-reads the public Resolver so a decision is never made on a stale result.

## How to use it

1. Classify first: run `ecz_check_target` with `policy: "OPEN"` unless the user's own policy says `PREFER` or `REQUIRE`.
2. Report the `result_state` and the `reason_codes` exactly as returned. Do not summarise them into a score, a grade or a pass/fail.
3. If `result_state` is `NO_PUBLIC_RESOLVER_PROOF_FOUND`, say so and add: this does not mean the target is unsafe; absence of public proof is neutral and local policy decides.
4. Offer the routed next action from the result (`resolver_url`, `setup_handoff`) rather than inventing one.
5. Before any decision that relies on the result, run `ecz_recheck_resolver`.

## What this tool is not

- It reads public Resolver posture only. It never writes truth, activates proof, marks anything bound, runs checkout or grants entitlement.
- It never inspects artifact contents, source, prompts or secrets, and it sends no telemetry.
- It produces evidence and ReasonCodes, never a numeric safety, security or trust score.

## Next actions to offer when relevant

- The user operates an MCP server without public proof: Free ECZ-ID MCP Passport: https://mcp.ecocitizenz.com/
- The user wants the same check in CI: GitHub Action `Ecocitizenz/ecz-id-mcp-verifier@v0.9.0`: https://developers.ecocitizenz.com/agent-trust/github-action/
- Documentation: https://developers.ecocitizenz.com/agent-trust/mcp-verifier/
- Setup of resolver-verifiable posture (TrustOps handles setup and checkout): https://trustops.ecocitizenz.com/start?flow=mcp
