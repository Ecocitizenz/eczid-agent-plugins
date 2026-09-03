#!/usr/bin/env node
// ECZ-ID Plugin Foundry: release-blocking preflight for OpenAI submission packages.
//
// Every check runs against the built .zip, not against the source tree, because the
// archive is what OpenAI receives. Exit 0 = every package may be submitted; exit 1 =
// at least one check failed and nothing may be submitted.
//
// Usage: node foundry/openai-preflight.mjs [--dir <dir>] [--json]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zipRead } from "./zip.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const facts = JSON.parse(readFileSync(join(here, "product-facts.json"), "utf8"));
const defs = JSON.parse(readFileSync(join(here, "plugins.json"), "utf8"));

const dirArg = process.argv.indexOf("--dir");
const DIR = dirArg > 0 ? resolve(process.argv[dirArg + 1]) : join(root, "dist", "openai");
const AS_JSON = process.argv.includes("--json");
// --all also preflights plugins already published, for reproduction evidence.
const ALL = process.argv.includes("--all");

// OpenAI public-listing limits, proven by the accepted eczid-sbom-cra-readiness 0.1.1 listing.
const MAX_DISPLAY_NAME = 30;
const MAX_SUBTITLE = 30;
const MIN_LOGO = 256;          // directory logo
const MIN_COMPOSER_ICON = 48;  // composer icon

const results = [];
let checked = 0, failed = 0;
function check(pkg, name, fn) {
  checked++;
  try {
    const detail = fn();
    results.push({ pkg, name, ok: true, detail: detail ?? "" });
  } catch (e) {
    failed++;
    results.push({ pkg, name, ok: false, detail: e.message });
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

/** PNG signature + IHDR width/height. Throws if the bytes are not a PNG. */
function pngSize(buf) {
  const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert(buf.length > 24 && buf.subarray(0, 8).equals(SIG), "not a PNG (bad signature)");
  assert(buf.toString("ascii", 12, 16) === "IHDR", "not a PNG (first chunk is not IHDR)");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * Strict parser for the two-level YAML the foundry emits (nested maps by indent,
 * double-quoted or bare scalars, and sequences of bare scalars). Anything outside that
 * shape is an error rather than a silent misparse.
 */
function parseYaml(text) {
  const root = {};
  const stack = [{ indent: -1, node: root }];
  let lastKey = null, lastIndent = -1;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/\s+$/, "");
    if (!line || /^\s*#/.test(line)) return;
    const indent = line.length - line.replace(/^ */, "").length;
    const body = line.slice(indent);
    const at = (n) => `line ${i + 1}: ${n}`;
    if (body.startsWith("- ")) {
      assert(lastKey !== null && indent > lastIndent, at("sequence item with no parent key"));
      const parent = stack[stack.length - 1].node;
      if (!Array.isArray(parent[lastKey])) parent[lastKey] = [];
      parent[lastKey].push(scalar(body.slice(2).trim(), at));
      return;
    }
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const m = body.match(/^([A-Za-z0-9_]+):(?:\s+(.*))?$/);
    assert(m, at(`not a "key:" or "key: value" line: ${JSON.stringify(body)}`));
    const [, key, value] = m;
    const node = stack[stack.length - 1].node;
    if (value === undefined || value === "") {
      node[key] = {};
      stack.push({ indent, node: node[key] });
    } else {
      node[key] = scalar(value, at);
    }
    lastKey = key; lastIndent = indent;
  });
  return root;
  function scalar(v, at) {
    if (v.startsWith('"')) {
      assert(v.endsWith('"') && v.length >= 2, at("unterminated double-quoted scalar"));
      return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    assert(!v.includes(": "), at(`ambiguous bare scalar: ${JSON.stringify(v)}`));
    if (v === "true") return true;
    if (v === "false") return false;
    return v;
  }
}

/** SKILL.md frontmatter: flat scalar keys only, which is all a submission carries. */
function skillFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert(m, "SKILL.md has no frontmatter block");
  const fm = {};
  for (const line of m[1].split("\n")) {
    if (!line.trim()) continue;
    const km = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    assert(km, `frontmatter line is not "key: value": ${JSON.stringify(line)}`);
    fm[km[1]] = km[2].trim();
  }
  return { fm, body: text.slice(m[0].length) };
}

const NEGATORS = /\b(not|never|no|without|rather than|instead of|does not|doesn't|isn't|nor|neither|cannot)\b/i;
function assertedClaims(text) {
  const out = [];
  for (const src of facts.forbiddenClaims) {
    const re = new RegExp(src, "gi");
    let m;
    while ((m = re.exec(text)) !== null) {
      const start = Math.max(0, text.lastIndexOf(".", m.index) + 1, text.lastIndexOf("\n", m.index) + 1);
      if (NEGATORS.test(text.slice(start, m.index))) continue;
      out.push(`"${m[0]}" in: ${text.slice(start, m.index + 60).replace(/\s+/g, " ").trim()}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------- run
const submitting = defs.plugins.filter((d) => ALL || d.openai?.submit);
assert(submitting.length > 0, "no plugin is marked for OpenAI submission");

const tmpRoot = mkdtempSync(join(tmpdir(), "eczid-openai-preflight-"));
const packages = [];

for (const def of submitting) {
  const pkg = def.id;
  const file = join(DIR, `${pkg}-openai-SUBMISSION-READY.zip`);
  let entries = null, byName = new Map();

  check(pkg, "package ZIP exists", () => {
    assert(existsSync(file), `missing ${file}`);
    return file;
  });
  if (!existsSync(file)) continue;
  const buf = readFileSync(file);

  check(pkg, "ZIP opens and every entry's CRC verifies", () => {
    entries = zipRead(buf).entries;
    for (const e of entries) byName.set(e.name, e);
    return `${entries.length} entries, ${buf.length} bytes`;
  });
  if (!entries) continue;

  check(pkg, "every archive path uses POSIX separators", () => {
    const bad = entries.filter((e) => e.rawName.includes(String.fromCharCode(92)));
    assert(bad.length === 0, `Windows separators in: ${bad.map((e) => e.rawName).join(", ")}`);
  });
  check(pkg, "no absolute archive path", () => {
    const bad = entries.filter((e) => e.name.startsWith("/") || /^[a-zA-Z]:/.test(e.name));
    assert(bad.length === 0, `absolute paths: ${bad.map((e) => e.name).join(", ")}`);
  });
  check(pkg, "no . or .. path segment", () => {
    const bad = entries.filter((e) => e.name.split("/").some((s) => s === "." || s === ".."));
    assert(bad.length === 0, `relative segments: ${bad.map((e) => e.name).join(", ")}`);
  });
  check(pkg, "no duplicate archive entry", () => {
    const seen = new Set(), dup = [];
    for (const e of entries) { if (seen.has(e.name)) dup.push(e.name); seen.add(e.name); }
    assert(dup.length === 0, `duplicates: ${dup.join(", ")}`);
  });
  check(pkg, "no empty entry", () => {
    const empty = entries.filter((e) => e.size === 0);
    assert(empty.length === 0, `zero-byte entries: ${empty.map((e) => e.name).join(", ")}`);
  });

  // ---- manifest
  let manifest = null;
  check(pkg, ".codex-plugin/plugin.json exists and parses", () => {
    const e = byName.get(".codex-plugin/plugin.json");
    assert(e, "missing .codex-plugin/plugin.json");
    manifest = JSON.parse(e.data.toString("utf8"));
  });
  if (!manifest) continue;

  check(pkg, "manifest has every required field", () => {
    for (const k of ["name", "version", "description", "author", "homepage", "license", "skills", "interface"]) {
      assert(manifest[k] !== undefined, `missing manifest field "${k}"`);
    }
    for (const k of ["displayName", "shortDescription", "longDescription", "developerName", "category", "capabilities", "websiteURL", "logo", "composerIcon"]) {
      assert(manifest.interface[k] !== undefined, `missing interface field "${k}"`);
    }
  });
  check(pkg, "package name is correct", () => {
    assert(manifest.name === def.id, `manifest name "${manifest.name}" != "${def.id}"`);
    return manifest.name;
  });
  check(pkg, "version is correct", () => {
    assert(manifest.version === defs.version, `manifest version "${manifest.version}" != foundry version "${defs.version}"`);
    return manifest.version;
  });
  check(pkg, `display name <= ${MAX_DISPLAY_NAME} chars`, () => {
    const v = manifest.interface.displayName;
    assert(v.length <= MAX_DISPLAY_NAME, `${v.length} chars: ${JSON.stringify(v)}`);
    return `${v.length}: ${v}`;
  });
  check(pkg, `subtitle <= ${MAX_SUBTITLE} chars`, () => {
    const v = manifest.interface.shortDescription;
    assert(v.length <= MAX_SUBTITLE, `${v.length} chars: ${JSON.stringify(v)}`);
    return `${v.length}: ${v}`;
  });
  check(pkg, "manifest URLs are https on an allowed host", () => {
    for (const u of [manifest.homepage, manifest.interface.websiteURL, manifest.repository, manifest.author?.url].filter(Boolean)) {
      const url = new URL(u);
      assert(url.protocol === "https:", `not https: ${u}`);
      assert(facts.allowedLinkHosts.includes(url.hostname), `host not allowed: ${url.hostname}`);
    }
  });
  check(pkg, "manifest asserts no unsupported claim", () => {
    const claims = assertedClaims(JSON.stringify([manifest.description, manifest.interface.shortDescription, manifest.interface.longDescription]));
    assert(claims.length === 0, claims.join(" | "));
  });

  // ---- icons
  for (const [field, min] of [["logo", MIN_LOGO], ["composerIcon", MIN_COMPOSER_ICON]]) {
    check(pkg, `interface.${field} resolves to a square PNG >= ${min}x${min}`, () => {
      const ref = manifest.interface[field];
      assert(typeof ref === "string" && ref.startsWith("./"), `${field} must be a "./"-relative path, got ${JSON.stringify(ref)}`);
      // Resolves from the PLUGIN ROOT.
      const target = ref.slice(2);
      const e = byName.get(target);
      assert(e, `${field} -> ${target} is not in the archive`);
      const { width, height } = pngSize(e.data);
      assert(width === height, `${target} is ${width}x${height}, not square`);
      assert(width >= min, `${target} is ${width}x${height}, below ${min}x${min}`);
      return `${target} ${width}x${height}`;
    });
  }

  // ---- skills
  const skillDirs = [...new Set(entries.map((e) => e.name.match(/^skills\/([^/]+)\//)?.[1]).filter(Boolean))];
  check(pkg, "skills/ contains at least one immediate skill", () => {
    assert(skillDirs.length >= 1, "no skills/<name>/ directory in the archive");
    return skillDirs.join(", ");
  });
  check(pkg, "archive contains only expected top-level entries", () => {
    const tops = [...new Set(entries.map((e) => e.name.split("/")[0]))].sort();
    const allowed = [".codex-plugin", "assets", "skills"];
    const extra = tops.filter((t) => !allowed.includes(t));
    assert(extra.length === 0, `unexpected top-level entries: ${extra.join(", ")}`);
    return tops.join(", ");
  });

  for (const skill of skillDirs) {
    const sw = `${pkg}/skills/${skill}`;
    let fm = null, body = "";
    check(sw, "SKILL.md exists and its frontmatter parses", () => {
      const e = byName.get(`skills/${skill}/SKILL.md`);
      assert(e, "missing SKILL.md");
      ({ fm, body } = skillFrontmatter(e.data.toString("utf8")));
    });
    if (!fm) continue;
    check(sw, "skill name matches its folder", () => {
      assert(fm.name === skill, `frontmatter name "${fm.name}" != folder "${skill}"`);
      return fm.name;
    });
    check(sw, "skill description exists", () => {
      assert(fm.description && fm.description.length > 0, "empty description");
      assert(fm.description.length <= 1024, `description is ${fm.description.length} chars (max 1024)`);
      return `${fm.description.length} chars`;
    });
    check(sw, "SKILL.md asserts no unsupported claim", () => {
      const claims = assertedClaims(body);
      assert(claims.length === 0, claims.join(" | "));
    });
    check(sw, "SKILL.md URLs are https on an allowed host", () => {
      for (const u of new Set(body.match(/https?:\/\/[^\s)\]"'`<>]+/g) ?? [])) {
        const url = new URL(u.replace(/[.,;:]+$/, ""));
        assert(url.protocol === "https:", `not https: ${u}`);
        assert(facts.allowedLinkHosts.includes(url.hostname), `host not allowed: ${url.hostname}`);
      }
    });

    let yaml = null;
    check(sw, "agents/openai.yaml exists and parses", () => {
      const e = byName.get(`skills/${skill}/agents/openai.yaml`);
      assert(e, "missing agents/openai.yaml");
      yaml = parseYaml(e.data.toString("utf8"));
      assert(yaml.interface, "openai.yaml has no interface block");
    });
    if (!yaml) continue;
    check(sw, "openai.yaml display_name and short_description are within the listing limits", () => {
      const d = yaml.interface.display_name, s = yaml.interface.short_description;
      assert(typeof d === "string" && d.length > 0 && d.length <= MAX_DISPLAY_NAME, `display_name: ${JSON.stringify(d)}`);
      assert(typeof s === "string" && s.length > 0 && s.length <= MAX_SUBTITLE, `short_description: ${JSON.stringify(s)}`);
      return `${d.length} / ${s.length}`;
    });
    for (const field of ["icon_small", "icon_large"]) {
      check(sw, `${field} resolves from the SKILL ROOT`, () => {
        const ref = yaml.interface[field];
        assert(typeof ref === "string" && ref.startsWith("./"), `${field} must be a "./"-relative path, got ${JSON.stringify(ref)}`);
        // The lesson from the first submission: this resolves from skills/<skill>/,
        // NOT from skills/<skill>/agents/.
        const target = `skills/${skill}/${ref.slice(2)}`;
        const wrong = `skills/${skill}/agents/${ref.slice(2)}`;
        assert(byName.has(target), `${field} -> ${target} is not in the archive`);
        assert(!byName.has(wrong), `${field} asset is also at ${wrong}; it must live at the skill root only`);
        const { width, height } = pngSize(byName.get(target).data);
        assert(width === height, `${target} is ${width}x${height}, not square`);
        assert(width >= MIN_COMPOSER_ICON, `${target} is ${width}x${height}, below ${MIN_COMPOSER_ICON}x${MIN_COMPOSER_ICON}`);
        return `${target} ${width}x${height}`;
      });
    }

    // ---- referenced files and scripts
    check(sw, "every file the SKILL.md references exists in the archive", () => {
      const refs = new Set();
      for (const m of body.matchAll(/\b((?:scripts|references|assets)\/[A-Za-z0-9._/-]+)/g)) refs.add(m[1]);
      const missing = [...refs].filter((r) => !byName.has(`skills/${skill}/${r}`));
      assert(missing.length === 0, `referenced but absent: ${missing.join(", ")}`);
      return [...refs].join(", ") || "none";
    });
    check(sw, "every JSON reference parses", () => {
      const jsons = entries.filter((e) => e.name.startsWith(`skills/${skill}/references/`) && e.name.endsWith(".json"));
      for (const e of jsons) JSON.parse(e.data.toString("utf8"));
      return `${jsons.length} file(s)`;
    });

    const scripts = entries.filter((e) => e.name.startsWith(`skills/${skill}/scripts/`) && e.name.endsWith(".mjs"));
    if (scripts.length) {
      const stage = join(tmpRoot, pkg, skill);
      for (const e of entries) {
        const p = join(stage, e.name);
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, e.data);
      }
      check(sw, "every bundled script parses", () => {
        for (const e of scripts) execFileSync(process.execPath, ["--check", join(stage, e.name)], { stdio: "pipe" });
        return `${scripts.length} script(s)`;
      });
      check(sw, "review script runs against a harmless fixture and yields a Review Priority", () => {
        const fixture = join(tmpRoot, `${pkg}-fixture`);
        mkdirSync(join(fixture, "docs"), { recursive: true });
        writeFileSync(join(fixture, "README.md"), "fixture\n");
        const script = join(stage, `skills/${skill}/scripts/review.mjs`);
        assert(existsSync(script), "no scripts/review.mjs to run");
        const out = execFileSync(process.execPath, [script, fixture], { encoding: "utf8" });
        assert(/## Review Priority: (LOW|NORMAL|ELEVATED|HIGH)/.test(out), "no Review Priority in the output");
        const claims = assertedClaims(out);
        assert(claims.length === 0, `review output asserts: ${claims.join(" | ")}`);
        const j = JSON.parse(execFileSync(process.execPath, [script, fixture, "--json"], { encoding: "utf8" }));
        assert(j.review_priority?.level, "--json has no review_priority.level");
        assert(j.contextual_next_actions.length <= 3, "more than three next actions");
        return `${j.review_priority.level}, ${j.contextual_next_actions.length} action(s)`;
      });
      check(sw, "bundled scripts open no file and make no network call", () => {
        for (const e of scripts) {
          const src = e.data.toString("utf8");
          for (const bad of ["readFileSync(", "openSync(", "createReadStream(", "fetch(", "node:https", "node:http", "node:net", "writeFileSync(", "child_process"]) {
            assert(!src.includes(bad), `${e.name} contains ${bad}`);
          }
        }
      });
    }
  }

  // ---- package-wide boundaries
  check(pkg, "no unexpected network requirement (no MCP server declared, no remote URL to call)", () => {
    assert(manifest.mcpServers === undefined, "manifest declares mcpServers; an OpenAI MCP submission needs a public production MCP URL and a /.well-known/openai-apps-challenge token");
    const mcpFiles = entries.filter((e) => /(^|\/)\.?mcp(_config)?\.json$/.test(e.name));
    assert(mcpFiles.length === 0, `MCP configuration in the archive: ${mcpFiles.map((e) => e.name).join(", ")}`);
  });
  check(pkg, "no source upload and no telemetry introduced", () => {
    const text = entries.filter((e) => !e.name.endsWith(".png")).map((e) => e.data.toString("utf8")).join("\n");
    // Named collectors and SDKs only. The bare word "telemetry" appears throughout these
    // packages inside the promise NOT to collect any, so matching it would flag the denial.
    for (const bad of ["posthog", "segment.io", "google-analytics", "googletagmanager", "mixpanel", "sentry.io", "amplitude.com", "datadoghq", "bugsnag", "navigator.sendbeacon"]) {
      assert(!text.toLowerCase().includes(bad), `archive references the collector ${bad}`);
    }
    for (const m of text.matchAll(/https?:\/\/[^\s)\]"'`<>]+/g)) {
      const host = new URL(m[0].replace(/[.,;:]+$/, "")).hostname;
      assert(facts.allowedLinkHosts.includes(host), `archive references a host that is not allow-listed: ${host}`);
    }
  });
  check(pkg, "no secret-shaped material in the archive", () => {
    const text = entries.filter((e) => !e.name.endsWith(".png")).map((e) => e.data.toString("utf8")).join("\n");
    for (const re of [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bsk-[A-Za-z0-9]{20,}/, /\bghp_[A-Za-z0-9]{20,}/, /\bAKIA[0-9A-Z]{16}\b/]) {
      assert(!re.test(text), `archive matches ${re}`);
    }
  });

  packages.push({
    id: pkg,
    displayName: manifest.interface.displayName,
    subtitle: manifest.interface.shortDescription,
    version: manifest.version,
    file,
    bytes: buf.length,
    sha256: createHash("sha256").update(buf).digest("hex"),
    entries: entries.map((e) => e.name)
  });
}

rmSync(tmpRoot, { recursive: true, force: true });

if (AS_JSON) {
  console.log(JSON.stringify({ checked, failed, packages, results }, null, 2));
} else {
  let current = null;
  for (const r of results) {
    if (r.pkg !== current) { current = r.pkg; console.log(`\n${current}`); }
    console.log(`  ${r.ok ? "ok  " : "FAIL"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
  }
  console.log("");
  console.log(failed
    ? `PREFLIGHT FAILED: ${failed} of ${checked} checks failed across ${submitting.length} packages. Nothing may be submitted.`
    : `PREFLIGHT PASSED: ${checked} checks across ${packages.length} packages.`);
}
process.exit(failed ? 1 : 0);
