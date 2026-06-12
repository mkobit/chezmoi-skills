# Agent instructions

This repository contains skills for AI agents managing `chezmoi`.

## Skill structure

When adding or modifying skills in the `skills/` directory, you must follow the progressive disclosure pattern outlined in the [Developer's Guide to Building ADK Agents with Skills](https://developers.googleblog.com/developers-guide-to-building-adk-agents-with-skills/).

Ensure agents only load context when needed to improve efficiency.

## Scratch files

Never commit scratch or one-shot helper scripts (crawlers, parsers, experiments).
Work in a temporary directory outside the repository, or delete the files before committing.
To source upstream chezmoi documentation, clone or fetch raw files from <https://github.com/twpayne/chezmoi> (docs live under `assets/chezmoi.io/docs/`) instead of writing scraping scripts.
