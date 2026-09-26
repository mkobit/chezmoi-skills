# Chezmoi agent skills

[![CI](https://github.com/mkobit/chezmoi-skills/actions/workflows/ci.yml/badge.svg)](https://github.com/mkobit/chezmoi-skills/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/mkobit/chezmoi-skills)](https://github.com/mkobit/chezmoi-skills/releases)
[![Agent Skills](https://img.shields.io/badge/Agent%20Skills-compatible-blue)](https://agentskills.io/)
[![Plugin manifest](https://img.shields.io/badge/plugin%20manifest-Claude-blue)](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview)
[![chezmoi](https://img.shields.io/badge/chezmoi-tools-blue)](https://github.com/twpayne/chezmoi)

Agent skills for use with chezmoi.

These skills follow the [agent skills specification](https://agentskills.io/specification) and use progressive disclosure so agents load detailed references only when needed.

## Install

Each directory under [`skills/`](skills/) is a portable skill source with a `SKILL.md` entry point.

### Claude Code

Add the marketplace with `claude plugin marketplace add mkobit/chezmoi-skills`.

Install the plugin with `claude plugin install chezmoi@chezmoi-skills`.

### Codex

Add the marketplace with `codex plugin marketplace add mkobit/chezmoi-skills`.

Launch `codex`, run `/plugins`, and install Chezmoi from the marketplace UI.

### Cursor and other skill hosts

Copy or symlink the required directories from [`skills/`](skills/) into the host's documented skill-discovery location.

Cursor discovers project skills from `.agents/skills/` and `.cursor/skills/`, including nested directories.

AGY and other Agent Skills consumers require their own documented discovery or packaging steps.

## Compatibility status

The repository contains a Claude marketplace manifest at [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json), a portable [Agent Plugins manifest](plugin.json), and a Codex compatibility manifest at [`.codex-plugin/plugin.json`](.codex-plugin/plugin.json).

| Host | Current status |
| --- | --- |
| Claude Code | The repository supplies a Claude marketplace manifest, but installation has not been exercised in automated integration tests. |
| Codex | The portable and Codex compatibility manifests are present, but this package has not yet passed an end-to-end Codex installation test. |
| Cursor | The skill layout now satisfies Cursor's documented `name`-to-directory requirement, but this package has not yet passed an end-to-end Cursor installation test. |
| AGY | Compatibility has not been assessed. |
| Other Agent Skills consumers | The skills follow the open specification, but each host's discovery, packaging, and frontmatter requirements must be verified before claiming support. |

Do not treat the table as a support guarantee.

## Local development

Install the pinned Bun version and project tools with `mise install`.

Install locked dependencies with `bun install --frozen-lockfile`.

Run the structural checks with `mise run validate`.

Run deterministic contract tests with `mise run test:contracts`.

Run unit tests with `mise run test`.

Run all linters with `mise run lint`.

Generate the Promptfoo suites and validate both configurations without provider calls with `bun run eval:validate`.

Run the answer and routing benchmarks with `bun run eval` only when the required model-provider credentials are configured.

Live-evaluation results are not yet a verified compatibility signal and require review before they inform release decisions.

Use the [live benchmark review workflow](docs/live-benchmark.md) before authorizing or accepting a credentialed run.

## Contributing and releases

Keep skill entry points concise and move detailed material into linked `references/` files.

Use conventional commits and semantic pull-request titles.

Use `feat` or `fix` for skill-content changes that should produce a release, and use `docs` only for repository documentation.

Open a pull request against `main`, wait for required checks, and merge through the pull-request workflow.

Release Please creates releases from eligible commits on `main` and synchronizes manifest versions.

## License

This project is licensed under the [MIT License](LICENSE).
