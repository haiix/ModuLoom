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

Custom-node expressions execute in a QuickJS-Emscripten virtual machine inside a Vite-built Module Worker, not in the page's or Worker's host JavaScript realm. The Worker reuses one release-sync WASM module, while every evaluation creates and disposes a separate QuickJS Runtime and Context. This prevents guest code from receiving the DOM, React state, network, storage, module loaders, or other browser host objects. Each Runtime has a 750 ms CPU deadline, 16 MiB heap limit, and 512 KiB stack limit. The parent thread also terminates an execution after 1,000 ms or an `AbortSignal`. A CPU, heap, or stack failure, parent timeout, cancellation, or Worker failure terminates the Worker; the next queued evaluation starts a clean Worker and WASM module.

The expression receives only an `inputs` value reconstructed from JSON. Expression source is limited to 64 KiB, and both input and output JSON are limited to 1 MiB (all measured as UTF-8). Results are serialized inside QuickJS before they cross back to the Worker host. Ordinary ECMAScript value operations and built-ins such as `Math`, `JSON`, and self-contained `Promise` chains are supported. The only host asynchronous bridge is `sleep(ms)`, restricted to 0–1,000 ms; generic timers are not exposed. Acorn validates expression syntax synchronously, and static validation rejects direct use of DOM, network, storage, module-loading, worker-creation, dynamic-code-generation, and prototype-manipulation APIs as a product policy. Neither form of validation is the security boundary. Projects containing `customCode` require an explicit trust confirmation before they can be applied.

This is defense in depth, not a formally verified capability-secure sandbox. QuickJS-Emscripten is pre-1.0 and has not been independently audited for ModuLoom's threat model. Runtime limits reduce resource-exhaustion risk but do not prove arbitrary JavaScript safe. Static token validation can be bypassed by equivalent syntax and is not relied on to block computed property access; isolation comes from the unprivileged QuickJS realm and JSON boundary. Generated TypeScript intentionally contains the custom expression without the ModuLoom Worker/QuickJS boundary. Only load project files from trusted sources. Do not put secrets in node inputs. Report isolation failures through the private process above.
