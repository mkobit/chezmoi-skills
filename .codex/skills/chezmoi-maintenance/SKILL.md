---
name: chezmoi-maintenance
description: Review and update this repository's chezmoi skills against upstream releases and documentation. Use when maintaining the skills for a new chezmoi version, not for ordinary dotfile updates.
---

# Update skills from upstream chezmoi

Use this workflow in the chezmoi-skills repository when asked to review or apply upstream updates.
Respect the requested scope and distinguish a review from a request to edit files.

1. Read the repository instructions and the documented chezmoi baseline in `README.md`.
2. Identify the target release from the user's request or the latest stable upstream release.
   Check the release notes between the baseline and target, including breaking changes and new features.
   Use the [upstream releases](https://github.com/twpayne/chezmoi/releases) and the documentation at the target tag under `assets/chezmoi.io/docs/` in the [upstream repository](https://github.com/twpayne/chezmoi).
   Clone or fetch raw files from upstream rather than writing scraping scripts.
3. Compare relevant upstream changes and documentation with the affected skills, references, and evaluation cases.
   Verify commands against the target CLI in an isolated temporary source, destination, config, and state when feasible.
   Record evidence with upstream version and source links, and distinguish confirmed differences from unverified hypotheses.
4. For an update request, revise affected guidance and evaluations, preserve progressive disclosure, and run the repository's validation and relevant tests.
   Report any changes that could not be verified.
5. Update the README baseline badge only after reviewing the full published skill set against the target release and applying or explicitly recording outstanding relevant differences.
   A partial review must not claim a new full-repository baseline.

If the existing baseline is unknown or its review coverage cannot be established, report that limitation and assess the full skill set before claiming a baseline.
