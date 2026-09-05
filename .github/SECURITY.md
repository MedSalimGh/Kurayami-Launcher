# Security Policy

## Supported Versions

We actively provide security updates and patches for the following versions of **Kurayami Launcher**:

| Version | Supported          | Notes |
| ------- | ------------------ | ----- |
| 1.0.x   | :white_check_mark: | Current Active Release |
| < 1.0   | :x:                | Legacy / Deprecated (Upgrade Required) |

---

## 🛡️ Anti-Cheat & Vanguard Safety Policy

Kurayami Launcher is built strictly for **client-side cosmetic modding and aesthetic enhancements**. 

- **No Memory Manipulation:** The launcher operates via virtual overlay WAD redirection. It does **not** read or modify game memory (RAM), inject DLLs into active combat threads, or manipulate player coordinates/actions.
- **No Unfair Advantage:** We strictly prohibit any mods that provide gameplay advantages, including zoomhacks, cooldown trackers, custom hitboxes, or hidden ward indicators.
- **Vanguard Compatible:** The launcher uses high-priority process synchronization to respect Vanguard's early driver validation lifecycle without interfering with anti-cheat telemetry.

> **Disclaimer:** While client-side cosmetic modding is generally accepted in the community, using any third-party tools is done at your own risk. Refer to Riot Games' official third-party software policies for terms of service details.

---

## 🔒 Reporting a Vulnerability

If you discover a security vulnerability or exploit within Kurayami Launcher:

1. **Do NOT open a public GitHub issue.** Public disclosure puts users at risk.
2. Report the vulnerability privately via **GitHub Security Advisories** (navigate to `Security` -> `Report a vulnerability` on the repository).
3. Alternatively, contact the project maintainer **BLACK STAR** directly on the [Kurayami Discord](https://discord.gg/CdKqcMwErf).

### What to Include in Your Report:
- A detailed description of the vulnerability.
- Clear step-by-step instructions or reproduction scenarios.
- Impact assessment (e.g., potential privilege escalation, token leakage, or crash exploit).
- Your suggested remediation or fix, if available.

### Response Timeline:
- **Initial Acknowledgement:** Within 24-48 hours.
- **Triage & Status Update:** Within 72 hours.
- **Patch Release & Advisory:** Coordinated release within 7-14 days depending on severity.

Thank you for responsibly disclosing security vulnerabilities and keeping the community safe.
