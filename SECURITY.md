# Security Policy

## Supported Versions

Only the latest version of this project is supported with security updates.

| Version | Supported |
| ------- | --------- |
| latest  | ✅        |
| older   | ❌        |

## Reporting a Vulnerability

If you discover a security vulnerability, please do not create a public issue.

Instead, report it via GitHub Security Advisories:

1. Go to the "Security" tab of this repository.
2. Click "Report a vulnerability".
3. Fill in the details and submit.

If GitHub Security Advisories is not available, you may contact me by email:

haiix268@gmail.com

Please include as much information as possible, such as:

- Affected version(s)
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Proof of concept (if available)

I will respond as soon as reasonably possible.

## Custom Code Security Boundary

Custom-node expressions execute in a dedicated Web Worker, not in the page's JavaScript realm. This prevents direct access to the DOM, React state, and page-scoped objects. Each execution is terminated after 1,000 ms, can be cancelled through an `AbortSignal`, and may return at most 1 MiB of JSON-serializable data. The worker is terminated and its Blob URL is revoked after every outcome.

The expression receives only `inputs`. Ordinary ECMAScript value operations and built-ins such as `Math`, `JSON`, and `Promise` are supported. Static validation rejects direct use of DOM, network, storage, module-loading, worker-creation, dynamic-code-generation, and prototype-manipulation APIs. Projects containing `customCode` require an explicit trust confirmation before they can be applied.

This is defense in depth, not a complete capability-secure sandbox. Web Workers still have browser-provided capabilities, static token validation cannot prove arbitrary JavaScript safe, and generated TypeScript intentionally contains the custom expression without the ModuLoom worker boundary. Only load project files from trusted sources. Do not put secrets in node inputs. Report validation bypasses or isolation failures through the private process above.
