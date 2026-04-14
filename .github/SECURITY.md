# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest on `main` | Yes |
| Older commits | No |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report security issues privately via GitHub's built-in private vulnerability reporting:
**Security → Report a vulnerability** (in the repo's Security tab).

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix if you have one

You will receive a response within 7 days. If the issue is confirmed, a patch will be prioritized and released as soon as possible.

## Scope

### In scope
- Calculation errors that could lead to dangerous gas mixes (incorrect MOD, END, blending math)
- Dependency vulnerabilities (report via private advisory or Dependabot)
- XSS or injection vulnerabilities in the contact form or user inputs

### Out of scope
- Issues requiring physical access to the device
- Social engineering attacks
- Theoretical vulnerabilities without a practical exploit path

## Safety Notice

DiveBlendr is a planning aid. All calculations should be verified with certified dive planning software and a qualified dive professional before use in actual diving operations. Technical diving requires proper training and certification.
