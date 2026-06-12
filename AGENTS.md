# Agent instructions

This repository contains skills for AI agents managing `chezmoi`.

## Skill structure

When adding or modifying skills in the `skills/` directory, you must follow the progressive disclosure pattern outlined in the [Developer's Guide to Building ADK Agents with Skills](https://developers.googleblog.com/developers-guide-to-building-adk-agents-with-skills/).

Ensure agents only load context when needed to improve efficiency.

## Commit and PR title conventions

Commits and PR titles follow [conventional commits](https://www.conventionalcommits.org/); PR titles are enforced by CI and become the commit message on squash merge.
Releases are managed by [release-please](https://github.com/googleapis/release-please) — see `release-please-config.json` for the recognized types and their changelog sections.
Skill content is the product of this repository: use `feat`/`fix` for skill changes so they trigger releases, and reserve `docs` for repository documentation.

## Scratch files

Never commit scratch or one-shot helper scripts (crawlers, parsers, experiments).
Work in a temporary directory outside the repository, or delete the files before committing.
To source upstream chezmoi documentation, clone or fetch raw files from <https://github.com/twpayne/chezmoi> (docs live under `assets/chezmoi.io/docs/`) instead of writing scraping scripts.
