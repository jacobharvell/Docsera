# RR-083 — G6 Public Repository Audit

Date: 2026-11-04  
Scope: public-release readiness assessment of `main` at `4fc3334b738487e5028d1411392e78307682a254`, including files tracked at that commit and reachable Git history. This is an audit only; it does not remove, move, rewrite, or regenerate artifacts.

## Result

**G6 is not ready to close.** No credential-like value was found by the scans described below, and the MIT license is present. The remaining work is primarily public-repository hygiene: make the supported path obvious, stop presenting historical packages as runnable current surfaces, publish the missing contribution/security/support policy, and make a deliberate decision about internally oriented engineering evidence.

This assessment does **not** treat harmless PDI references, historical evidence, or developer tooling as a reason to delete them. It identifies the places where their current presentation would confuse or inconvenience a public user.

## Audit method and evidence

| Check | Evidence and result |
| --- | --- |
| Tracked-tree inventory | `git ls-files` at the audited commit: 660 files, about 33.9 MB. The largest two files are the frozen scoped release XML (about 11.0 MB) and its RR-077 diagnostic predecessor (about 11.0 MB). |
| Reachable-history sensitive-content scan | Scanned 422 revisions reachable from all local and remote refs with filename-only output. Patterns covered private-key blocks, common GitHub/OpenAI/AWS token forms, bearer credentials, and assigned API-key/client-secret/password values. **No matches.** This is a practical heuristic scan, not proof that no secret has ever existed in Git object storage. |
| Current-tree sensitive-content scan | The same patterns found **no matches** in `HEAD`; no tracked file is currently ignored by `.gitignore`. Candidate filenames were reviewed as code/docs, not credential material. |
| Commit metadata | All 422 reachable commit-email entries use the GitHub no-reply domain. This audit intentionally does not reproduce contributor identifiers. |
| Public-reference review | `README.md`, `.gitignore`, `LICENSE`, all package manifests, release files, root scripts, and source-path references were inspected. README paths were checked for existence. |
| Dependency and license review | `npm audit --package-lock-only --omit=dev --json` was run without changing lockfiles. The active UI and Global companion production dependency sets report zero vulnerabilities. The historical shell reports 11 production dependency advisories (8 moderate, 3 high). RR-016 remains useful context, but its active TipTap finding is stale: the active UI now pins TipTap 3.32.2. |
| Frozen-release review | Both `releases/0.1.0` XML files were inspected by filename, size, checksum, and marker-only scans; no secret pattern matched. Generic platform terms such as user/group/attachment/credential appear in the scoped metadata and require a human payload/privacy review before a public tag. This is not evidence that the package includes private data. |

Sensitive values, if found, would not be reproduced in this document. No values were found by the stated scans.

## Inventory and disposition

| Class | Evidence | Recommended disposition |
| --- | --- | --- |
| Production code and generated SDK metadata | 349 active non-test source files under `app/docsera-ui/src` and `scripts`; active runtime uses the SDK-native Direct UI Page package. | Retain. Describe this as the supported developer source in the public README. |
| Active tooling | 60 active UI/root tooling/configuration files, including the worktree guard and SDK build/install verification. | Retain. Split consumer installation from contributor/PDI commands. Do not expose or require local developer-instance aliases in a basic public quick start. |
| Global companion source | 32 files under `app/docsera-global-bridge`. Root scripts, active tests, and release-package provenance still reference it. | Retain as a release-build/maintenance boundary until the release process is deliberately simplified. Label it clearly as companion-source tooling, not a standalone app. |
| Historical shell | 22 files under `app/docsera-shell`, including old UI Builder metadata and a public (`private: false`) npm manifest. The root `validate` command still invokes it. | Retain for now, but quarantine its public presentation: it is historical rather than release runtime, has old vulnerable dependencies, and is still operationally coupled to root validation. Do not delete it until root validation, source references, and migration value are deliberately resolved. |
| Tests | 139 test files, plus focused test fixtures. | Retain. They are appropriate engineering evidence; explain the targeted test command in contributor documentation rather than the consumer README. |
| Engineering/process documentation | 221 `docs/process` files, 3 ADRs, evidence JSON, and reports. Many contain dated PDI identifiers, local Windows paths, update-set identifiers, and experimental narrative. | Retain as provenance where needed, but group or label it as engineering/release history. Review it for private operational detail before public visibility; it is not end-user documentation. |
| Fixtures and experiments | 15 files matched fixture/evidence/candidate paths, including the CTO-3B SDK proof fixture and RR-074/RR-077 candidate artifacts. | Retain while their associated release evidence is active. Make their diagnostic/non-consumer status explicit; archive or remove only after the release evidence has a durable replacement. |
| Frozen consumer package | `releases/0.1.0/README.md` plus scoped and Global XML artifacts. The release README gives order and SHA-256 checksums. | Retain unchanged, per task boundary. Before publication, add version/tag provenance, prerequisites, known limitations, support route, and a human data/metadata inspection record outside the frozen files. |

## Findings

### P1 — README describes tracked internal material as excluded and promotes a missing PoC

**Evidence.** `README.md` says `AGENTS.md`, `internal/`, and `poc/` are intentionally excluded, but `AGENTS.md` is tracked. It links to `poc/tiptap-component/`, which does not exist in the audited checkout. The README also sends readers to the historical shell README and lists a broad development command catalog before explaining how to install or use the frozen release.

**Impact.** A public visitor receives contradictory scope guidance and follows at least one broken path. The distinction between supported release, active source, and historical research is not clear enough for contributors or evaluators.

**Recommended action.** Rewrite the public README in one focused task: lead with purpose, support status, ServiceNow prerequisites, the supported release/install path, active source layout, and concise contributor entry points. Either describe `AGENTS.md` accurately as tracked contributor guidance or move its private-machine-specific material through an approved cleanup task. Remove or replace the missing PoC reference. Keep historical links in a clearly labeled section rather than the primary repo surface.

### P1 — Historical shell remains part of the apparent runnable project and has production audit findings

**Evidence.** `app/docsera-shell/README.md` calls the package historical, but its manifest is `private: false`, its README directs `npm install`, and root `validate` runs `validate:shell`. Its production-only package-lock audit reports 11 advisories (8 moderate, 3 high); it pins an older ProseMirror stack. It is not part of the frozen consumer artifacts.

**Impact.** A public contributor can reasonably run or publish an unsupported dependency surface and mistake it for the shipping app. The historical package is a release-hygiene and maintenance liability, though not evidence of a vulnerability in the active packaged runtime.

**Recommended action.** In a dedicated follow-up, decide whether the shell is (a) archived source retained in-repo, or (b) a maintained compatibility surface. If archived, mark it non-publishable, remove it from default validation/public quick starts, and place a concise archival notice at its entry point. If maintained, update its dependencies and add a supported purpose. Do not delete it merely because it is historical.

### P1 — Required public repository policy and support documents are absent

**Evidence.** No tracked `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, code of conduct, issue template directory, or pull-request template exists. The frozen package has no support/security route beyond installation order.

**Impact.** Security disclosures, installation help, bug reports, and contribution expectations have no safe, public destination. This is a public-release documentation gap even if the source itself is safe to view.

**Recommended action.** Add a small public-community documentation set: contribution setup/testing boundaries; a private security-reporting route and response expectation; support/issue triage guidance; and minimal issue templates. Link all of it from the public README and the release notes.

### P2 — Engineering evidence is valuable but is presented as ordinary public documentation

**Evidence.** `docs/process/` contains 221 files. It includes internal process notes, PDI host/instance references, local Windows paths, sys_ids, historical update-set diagnosis, abandoned experiments, and artifact provenance. The material appears intentional and does not contain a detected credential-like value.

**Impact.** It increases public-repository noise and reveals non-secret operational topology. It can make the project look less stable, and PDI-specific instructions can be mistaken for supported consumer installation directions.

**Recommended action.** Do not bulk-delete it. Create a short documentation index and classify each area as active architecture, active runbook, release evidence, or historical/archived investigation. Keep accepted rationale and reproducibility evidence; move only clearly superseded material in a reviewable archival task. Redact local filesystem paths and unnecessary live-instance identifiers from documents that remain prominently public.

### P2 — Diagnostic update-set candidates duplicate or closely mirror consumer-release artifacts

**Evidence.** The RR-077 scoped diagnostic XML is approximately 11.0 MB, nearly the size of the frozen scoped `0.1.0` artifact; RR-074 also has Global companion candidate material. The consumer artifacts have distinct checksums because their consumer-facing outer update-set names differ. The release files are frozen and must not be changed by this task.

**Impact.** Multiple similarly named XMLs create a realistic risk that a visitor imports a diagnostic candidate instead of the frozen consumer package. They also dominate repository size.

**Recommended action.** Retain candidates while their evidence is needed, but add a top-level release-artifact index that names the sole consumer import pair and labels all candidate/diagnostic XMLs "not for installation." After the release evidence is finalized, assess archival/removal of superseded candidates in one explicit artifact-governance task.

### P2 — License is present; attribution and redistribution evidence needs a final artifact-time check

**Evidence.** Root `LICENSE` is MIT. RR-016 found the active browser dependency families permissively licensed (MIT/ISC; Apache-2.0 applies to relevant tooling) and called for bundle-time notice review. Active production dependency audits now report zero findings. The license copyright holder is a personal public identifier; that is not a secret, but is a publication choice.

**Impact.** There is no known license incompatibility, but publication without checking the actual generated release assets could miss third-party-notice obligations. Historical shell dependencies should not be conflated with active runtime dependencies.

**Recommended action.** Before tag creation, generate the exact release assets, retain an SBOM/license-notice record or equivalent bundle-attribution review, and decide whether the current MIT copyright identity is the intended public attribution. Do not add a speculative NOTICE file before the actual distributed payload is known.

### P3 — Root scripts and package metadata expose an unclear maintenance boundary

**Evidence.** Root scripts invoke both `app/docsera-global-bridge` and `app/docsera-shell`; the active UI tests also intentionally read the companion source. The root package is `private: true`, while the historical shell is not. The active UI package is explicitly private.

**Impact.** The repository is not an npm package, but its script and manifest shape can lead external contributors to assume all subpackages share a supported publication/deployment lifecycle.

**Recommended action.** Document the repository as a source-and-ServiceNow-artifact project, not an npm-distribution monorepo. As part of the historical-shell decision, normalize `private` flags and root commands to reflect the supported maintenance workflow.

## Non-findings and retained material

- No credential-like content was detected in the audited current tree or 422 reachable revisions using the stated heuristic patterns.
- No tracked file is accidentally included despite matching `.gitignore`.
- The release `0.1.0` artifacts have the checksums stated in their frozen README; this audit did not modify them.
- `app/docsera-global-bridge`, historical update-set evidence, test fixtures, and `docs/process/` have a documented engineering purpose. They are not automatic deletion candidates.
- PDI hostnames, instance identifiers, sys_ids, and local paths are not secrets by themselves. Their prominence and unnecessary repetition are a public-facing hygiene concern, not a confirmed security incident.

## Coherent follow-up sequence

1. **Public entry-point cleanup (P1):** replace the README’s misleading/missing paths, name the supported consumer artifact, and add an artifact index that prevents diagnostic imports.
2. **Public collaboration policy (P1):** add contribution, security-reporting, and support guidance; connect it to issue templates and the release notes.
3. **Historical-surface decision (P1/P3):** explicitly archive or maintain `app/docsera-shell`, then adjust root validation and package visibility to match. Treat dependency updates as necessary only if the shell remains runnable/supported.
4. **Documentation/provenance curation (P2):** add an index, classify `docs/process`, and selectively redact or archive only material that adds no reproducibility value.
5. **Final artifact-time release review (P2):** inspect the exact export payload for data/metadata scope, capture third-party attribution evidence, and verify release docs/tag/checksums match the shipped pair.

Each step is independently reviewable; none requires rewriting Git history or modifying the frozen `0.1.0` package.

## Limitations

The scan is pattern-based and cannot prove absence of every possible secret, private datum, or third-party obligation. It does not inspect unreachable Git objects, external issue/PR attachments, GitHub settings, or the live ServiceNow instance. The release XML marker scan is deliberately conservative: a human who understands the intended ServiceNow metadata should perform the final consumer-payload review before publication.
