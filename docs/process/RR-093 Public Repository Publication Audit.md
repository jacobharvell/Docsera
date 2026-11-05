# RR-093 — Final Public Repository Publication Audit

Date: 2026-11-05  
Scope: final publication review of `feature/rr-083-public-repository-audit` at `c56d5d3a67151571940f7c4624ef306736419805`, including the tracked tree, all reachable local and remote Git revisions, frozen `0.1.0` consumer artifacts, and public-facing repository material. Frozen artifacts were read only.

## Launch assessment

**Repository-content readiness: ready for the owner-controlled publication activation sequence.** No inspected repository-content blocker was found. The earlier RR-083 public-entry-point, policy, and diagnostic-artifact concerns have been addressed: the public README and support documents are present, and superseded candidate/update-set XMLs are no longer tracked. This is an evidence-based review, not proof that an arbitrary secret or legal obligation cannot exist.

GitHub private vulnerability reporting is a public-repository feature, so it cannot be treated as a setting that must already be enabled while Docsera is private. Final publication readiness instead depends on completing the activation sequence below: make the repository public, immediately enable private vulnerability reporting, verify that the private reporting interface works, and only then announce or promote the release. If activation is unavailable, reverse public visibility until an approved alternative private reporting route exists.

## Evidence and conclusions

| Area | Evidence inspected | Conclusion |
| --- | --- | --- |
| Current tracked tree | 622 tracked files; credential/private-key heuristic scan and credential-like filename review. Pattern hits were test fixtures or documentation examples, not assigned credentials. | No credential, token, private key, or credential file found. |
| Reachable Git history | RR-083's documented 422-revision filename-only scan was reviewed; the ten commits from that audited base through this candidate were independently reviewed for added sensitive material. | No demonstrated credential exposure. The sole current reachable commit email is a GitHub no-reply address. Unreachable objects and external GitHub attachments were not inspected. |
| Personal/internal material | Public process evidence still contains historical PDI hostnames, sys_ids, and local Windows paths. These are not credentials, and the public README labels process documentation as engineering/release evidence rather than consumer instructions. | No demonstrated sensitive-personal-data publication risk. Treat remaining operational topology as a curation concern, not a blocker. |
| Scoped frozen XML | `docsera_application_0.1.0.xml`: 564 updates; no email address, private-key block, credential field, or instance-specific ServiceNow host found. Its external references resolve only to public standards/library/font hosts. | No sensitive or unrelated instance data detected by structural and marker review. |
| Global frozen XML | `docsera_global_companion_0.1.0.xml`: 24 updates; no email address, private-key block, credential field, or instance-specific ServiceNow host found. | No sensitive or unrelated instance data detected by structural and marker review. |
| Release integrity | Independent SHA-256 calculation matched the frozen release README for both XML artifacts. | Consumer artifacts are byte-identifiable and internally consistent. |
| License and assets | Root license is MIT. Paper Mono is bundled with its SIL OFL 1.1 text; primary inspected runtime dependencies are MIT (React, Tiptap, CodeMirror) or ISC (Lucide). No unlicensed image/font/icon asset was found. | No known license incompatibility or missing bundled-font attribution. |
| Public documentation | README, CONTRIBUTING, SUPPORT, SECURITY, release README, and both issue templates were inspected; `npm run validate:docs` passed. Public issue surfaces prohibit secrets and security disclosures. | No broken public-policy route in tracked files. Private reporting must be activated and verified as part of final publication activation before announcement. |

### Verified release checksums

| Artifact | SHA-256 |
| --- | --- |
| `releases/0.1.0/docsera_application_0.1.0.xml` | `9657a25db7c4b31eb3b6d7eb46662ed077ed3950a4f877c795629b6baf414848` |
| `releases/0.1.0/docsera_global_companion_0.1.0.xml` | `adae62031698b7b1596b71474defa7fb9889ffa40e30d40ad5ccfd01b64a0c50` |

## Findings and launch actions

### Blocking — complete the private-reporting publication activation sequence

GitHub private vulnerability reporting is not available while this repository is private. The repository owner must complete these steps in order:

1. Make the repository public.
2. Immediately enable **private vulnerability reporting** in the repository Security settings.
3. Verify that the repository Security tab exposes a working private vulnerability-reporting interface.
4. Only then announce or promote the release.

If private vulnerability reporting cannot be activated or verified, reverse public visibility until an approved alternative private reporting route exists. No public email address should be substituted unless it is deliberately approved and documented.

### Should-fix — make the Google Fonts privacy boundary intentional

`runtime-shell.css` imports Geist, Inter, and JetBrains Mono from `fonts.googleapis.com`. This causes a reader's browser to contact Google when the runtime stylesheet loads. It is neither a repository secret nor an artifact-integrity issue, but public release should either document that third-party request/privacy implication or self-host those fonts before launch. Paper Mono is already locally bundled with its required OFL text.

### Should-fix — curate historical operational evidence over time

Retained `docs/process` evidence includes PDI names, sys_ids, and developer-local paths. The material does not demonstrate exposure of a secret or personal data, and is clearly separated from consumer documentation. Before a later major release, selectively minimize unneeded operational identifiers in prominently linked historical documents; do not rewrite history or bulk-delete reproducibility evidence based on this audit alone.

### Optional/future — harden GitHub repository defaults

After publication, enable GitHub secret scanning and push protection if available for the repository, review Dependabot/dependency-graph alerts, and set branch protection/rulesets for the default branch. These are worthwhile preventive controls, not evidence of a current source-content blocker. Confirm ordinary issue creation remains enabled only if the maintainers intend to support the issue templates and SUPPORT policy.

## Limits of the review

Automated secret scans use recognizable formats and assignment patterns; they cannot establish that arbitrary opaque strings, encrypted material, or secrets in unreachable Git objects never existed. License review inspected the shipped source/assets and representative installed runtime dependency licenses; it is not a lawyer's opinion or an exhaustive generated-bundle notice audit. XML inspection was offline and structural/marker based; it did not import either artifact or inspect a live ServiceNow instance.

## Commands run

- RR-083's 422-revision filename-only history scan, plus an independent review of every change from its audited base through this candidate.
- Tracked-tree pattern/file-name scans and targeted review of every current pattern hit.
- XML parsing, metadata-marker checks, host extraction, and `Get-FileHash -Algorithm SHA256` for both frozen artifacts.
- Production-only `npm audit --package-lock-only --omit=dev --json` for `app/docsera-ui` and `app/docsera-global-bridge` (both reported zero vulnerabilities).
- `npm run validate:docs` (passed).

No deployment, PDI interaction, artifact regeneration, or Git-history rewrite was performed.
