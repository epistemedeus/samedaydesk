/* Shared SkillGuard command generator.
 * Loaded by preview/skillguard.html and by qual/url-consumer-test.js.
 * This module formats a local CLI command. It does not clone, fetch, or scan.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SkillGuardCommand = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var CLI = "npx github:epistemedeus/skillguard";
  var LOCAL_EXAMPLE = "./my-skill";

  // Supported bare hosts (no .git suffix required). Other hosts need a .git suffix.
  var HOSTS = {
    "github.com": { minSeg: 2, maxSeg: 2 },
    "gitlab.com": { minSeg: 2, maxSeg: 8 },
    "bitbucket.org": { minSeg: 2, maxSeg: 2 },
    "codeberg.org": { minSeg: 2, maxSeg: 2 }
  };

  var CONTROL_RE = /[\u0000-\u001f\u007f]/;
  // Space, quotes, escapes, expansion, pipes, redirects, and related shell metacharacters.
  // @ is rejected as userinfo. % is rejected so encoded tricks never reach the parser.
  var SHELL_META_RE = /[\s'"\\$`|;&<>(){}[\]*?!~#^%@,=]/;

  var NOTES = {
    empty: "Enter a public https Git URL, or use the CLI on a local folder.",
    invalid: "That is not a usable https URL. Nothing was fetched.",
    control: "Control characters are not accepted. Nothing was fetched.",
    shell: "Shell metacharacters are not accepted. Nothing was fetched.",
    credentials: "Only a bare https Git URL is accepted. Credentials, query strings, and fragments are rejected. Nothing was fetched.",
    unsupported: "Only a canonical public Git HTTPS URL is accepted: GitHub, GitLab, Bitbucket, Codeberg, or a URL that ends in .git. Nothing was fetched.",
    ok: "Command only. This page did not clone or scan the repository. Run the published SkillGuard CLI locally if you want an actual static check."
  };

  function shellSingleQuote(value) {
    return "'" + String(value).replace(/'/g, "'\\''") + "'";
  }

  function rejected(reason, note) {
    return {
      ok: false,
      reason: reason,
      url: null,
      command: "Rejected. No request was made.",
      note: note
    };
  }

  function isDnsHostname(host) {
    if (typeof host !== "string" || !host) return false;
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
    return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(host);
  }

  function pathSegments(pathname) {
    if (!pathname.startsWith("/")) return null;
    if (pathname.indexOf("//") !== -1) return null;
    var trimmed = pathname.replace(/\/+$/, "");
    if (trimmed === "") return null;
    var parts = trimmed.slice(1).split("/");
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (!part || part === "." || part === "..") return null;
      if (!/^[A-Za-z0-9._-]+$/.test(part)) return null;
    }
    return parts;
  }

  function parsePublicGitHttpsUrl(raw) {
    if (raw == null) {
      return { ok: false, reason: "invalid", url: null };
    }
    var text = String(raw).trim();
    if (!text) {
      return { ok: false, reason: "empty", url: null };
    }
    if (CONTROL_RE.test(text) || CONTROL_RE.test(String(raw))) {
      return { ok: false, reason: "control", url: null };
    }
    // Classify query, fragment, and userinfo before the generic shell-meta set.
    if (text.indexOf("?") !== -1) {
      return { ok: false, reason: "query", url: null };
    }
    if (text.indexOf("#") !== -1) {
      return { ok: false, reason: "fragment", url: null };
    }
    if (text.indexOf("@") !== -1) {
      return { ok: false, reason: "userinfo", url: null };
    }
    if (!/^https:\/\//i.test(text)) {
      return { ok: false, reason: "invalid", url: null };
    }
    if (SHELL_META_RE.test(text)) {
      return { ok: false, reason: "shell-meta", url: null };
    }

    var url;
    try {
      url = new URL(text);
    } catch (err) {
      return { ok: false, reason: "invalid", url: null };
    }

    if (url.protocol !== "https:") {
      return { ok: false, reason: "invalid", url: null };
    }
    if (url.username || url.password) {
      return { ok: false, reason: "userinfo", url: null };
    }
    if (url.search || url.hash || text.indexOf("?") !== -1 || text.indexOf("#") !== -1) {
      return { ok: false, reason: url.hash || text.indexOf("#") !== -1 ? "fragment" : "query", url: null };
    }
    if (url.port) {
      return { ok: false, reason: "invalid", url: null };
    }
    if (!isDnsHostname(url.hostname)) {
      return { ok: false, reason: "unsupported", url: null };
    }

    var parts = pathSegments(url.pathname);
    if (!parts) {
      return { ok: false, reason: "unsupported", url: null };
    }

    var path = "/" + parts.join("/");
    var safe = "https://" + url.hostname + path;
    var rawNorm = text.replace(/\/+$/, "").replace(/^https:\/\//i, "https://");
    var rawHostEnd = rawNorm.indexOf("/", "https://".length);
    if (rawHostEnd === -1) {
      return { ok: false, reason: "unsupported", url: null };
    }
    var rawHost = rawNorm.slice("https://".length, rawHostEnd).toLowerCase();
    var rawPath = rawNorm.slice(rawHostEnd).replace(/\/+$/, "");
    if (rawHost !== url.hostname || rawPath !== path) {
      return { ok: false, reason: "unsupported", url: null };
    }

    var hostSpec = HOSTS[url.hostname];
    var endsWithGit = parts[parts.length - 1].toLowerCase().endsWith(".git") && parts[parts.length - 1].length > 4;
    if (hostSpec) {
      if (parts.length < hostSpec.minSeg || parts.length > hostSpec.maxSeg) {
        return { ok: false, reason: "unsupported", url: null };
      }
    } else if (!endsWithGit) {
      return { ok: false, reason: "unsupported", url: null };
    }

    return { ok: true, reason: "ok", url: safe };
  }

  function commandForInput(raw) {
    var parsed = parsePublicGitHttpsUrl(raw);
    if (parsed.reason === "empty") {
      return {
        ok: false,
        reason: "empty",
        url: null,
        command: CLI + " " + shellSingleQuote(LOCAL_EXAMPLE),
        note: NOTES.empty
      };
    }
    if (!parsed.ok) {
      var note = NOTES.invalid;
      if (parsed.reason === "control") note = NOTES.control;
      else if (parsed.reason === "shell-meta") note = NOTES.shell;
      else if (parsed.reason === "userinfo" || parsed.reason === "query" || parsed.reason === "fragment") {
        note = NOTES.credentials;
      } else if (parsed.reason === "unsupported") {
        note = NOTES.unsupported;
      }
      return rejected(parsed.reason, note);
    }
    return {
      ok: true,
      reason: "ok",
      url: parsed.url,
      command: CLI + " " + shellSingleQuote(parsed.url),
      note: NOTES.ok
    };
  }

  return {
    CLI: CLI,
    NOTES: NOTES,
    shellSingleQuote: shellSingleQuote,
    parsePublicGitHttpsUrl: parsePublicGitHttpsUrl,
    commandForInput: commandForInput
  };
});
