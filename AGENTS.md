# Agent instructions

This repository contains skills for AI agents managing `chezmoi`.

## Skill structure

When adding or modifying skills in the `skills/` directory, you must follow the progressive disclosure pattern outlined in the [Developer's Guide to Building ADK Agents with Skills](https://developers.googleblog.com/developers-guide-to-building-adk-agents-with-skills/).

Ensure agents only load context when needed to improve efficiency.

## Commit and PR title conventions

Releases are managed by release-please, which only bumps versions for `feat` and `fix` commits.
Skill content is the product of this repository, so type changes accordingly:

- `feat`: a new skill, or new content in an existing skill (new sections, new reference files).
- `fix`: corrections to existing skill content (wrong commands, broken links, inaccurate facts).
- `docs`: repository documentation only (README, AGENTS.md) — appears in the changelog but does not trigger a release.
- `ci`, `build`, `chore`, `test`, `refactor`: tooling and maintenance — hidden from the changelog.

PR titles must follow the same convention (enforced by CI) because squash merges use the PR title as the commit message.

## Scratch files

Never commit scratch or one-shot helper scripts (crawlers, parsers, experiments).
Work in a temporary directory outside the repository, or delete the files before committing.
To source upstream chezmoi documentation, clone or fetch raw files from <https://github.com/twpayne/chezmoi> (docs live under `assets/chezmoi.io/docs/`) instead of writing scraping scripts.
