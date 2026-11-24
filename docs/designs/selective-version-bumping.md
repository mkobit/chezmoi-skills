# Selective version bumping for skills and plugin manifests

- **Author**: Mike Kobit
- **Status**: Proposed
- **Date**: 2026-11-24
- **Bead**: `cz-skl-ja8`

--------------------------------------------------------------------------------

## Decision

Keep unified repository versioning (Option A) across `package.json`, `plugin.json`, `.claude-plugin/`, `.codex-plugin/`, and `.release-please-manifest.json`.
Do not adopt `release-please` multi-package splitting (Option B) or a custom path-based version-bumping workflow (Option C) while all skills ship as a single `"chezmoi"` plugin.

## Current state

The repository publishes all nine skills under `skills/` as one plugin named `"chezmoi"` across three client ecosystems:

- **Single `release-please` package**: `release-please-config.json` defines one package at `"."` (`"release-type": "simple"`, `"bump-minor-pre-major": true`, `"skip-changelog": true`).
  `.release-please-manifest.json` tracks `"."` at `"0.0.1"`.
- **Synchronized `extra-files`**: Every release updates five JSON version fields in lockstep:
  - `plugin.json` (`$.version`)
  - `.codex-plugin/plugin.json` (`$.version`)
  - `.claude-plugin/plugin.json` (`$.version`)
  - `.claude-plugin/marketplace.json` (`$.plugins[0].version`)
  - `package.json` (`$.version`)
- **Release workflow**: `.github/workflows/release-please.yml` runs `googleapis/release-please-action@v5.0.0` on pushes to `main` and runs `bun run fmt` on open `release-please--branches--main` pull requests.
- **CI version-sync enforcement**: `validateVersionSync` in `scripts/skills/validate/manifests.ts` (executed by `bun run validate` in `.github/workflows/ci.yml`) fails CI if any of the five JSON manifests drift from `.release-please-manifest.json["."]`.
- **Unversioned `SKILL.md` files**: `skillSchema` in `scripts/skills/validate/skills.ts` validates only `name` and `description` in `skills/*/SKILL.md` frontmatter.
  None of the nine `SKILL.md` files declare a `version` or `metadata.version` field.
- **Shared skill root**: `.claude-plugin/marketplace.json` (`plugins[0]`) and `.codex-plugin/plugin.json` both point `"skills"` to `./skills` (`source: "./"`).

## Options evaluated

### Option A: Keep unified repo versioning (current)

Continue bumping `"."` as a single `release-please` package and enforcing exact equality across all manifests via `validateVersionSync`.

- **Pros**:
  - Matches the actual distribution unit: users install one `"chezmoi"` plugin containing all skills, not individual skill packages.
  - Guarantees consistent cache invalidation across Claude Code, Codex, and Agent Plugins whenever any skill changes.
  - Requires zero changes to `release-please-config.json`, `.github/workflows/release-please.yml`, `skillSchema`, or `validateVersionSync`.
- **Cons**:
  - Changing one skill bumps the version of the entire plugin, even if other skills are untouched.
  - Any `feat:` or `fix:` commit in non-skill directories (such as `scripts/` or `tests/`) also triggers a plugin version bump unless scoped as `chore:`, `test:`, or `ci:`.

### Option B: `release-please` multi-package or path-based components

Split `release-please-config.json` `packages` into separate path entries (for example, per `skills/<name>/` directory or separate `.claude-plugin` and `.codex-plugin` packages) tracked independently in `.release-please-manifest.json`.

- **Pros**:
  - Uses native `release-please` path filtering so untouched components are not bumped.
  - Supports per-component tags and changelogs if components are distributed separately.
- **Cons**:
  - **No per-skill manifest**: `skills/<name>/` directories contain only `SKILL.md`, `agents/openai.yaml`, and `references/*.md`.
    `release-please` cannot bump YAML frontmatter in `SKILL.md` without custom `generic` updater markers (`x-release-please-version`).
  - **Shared `./skills` mismatch**: `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and `plugin.json` all package `./skills`.
    Splitting manifests into separate `release-please` packages means edits under `skills/` fall outside `.claude-plugin/` and `.codex-plugin/`, so plugin manifests would not bump unless linked back together (which reproduces Option A with extra complexity).
  - **Breaks `validateVersionSync`**: Divergent versions across `package.json`, `plugin.json`, `.claude-plugin/`, and `.codex-plugin/` would fail `validateVersionSync` unless the check is removed or weakened.
  - **Release noise**: Introduces multiple `.release-please-manifest.json` keys, multiple git tags, and either multiple release PRs or multi-component PR boilerplate for one plugin.

### Option C: Lightweight path-based workflow

Add a custom GitHub Actions workflow or Bun script that inspects `git diff` paths on merge to `main`, bumps `metadata.version` in changed `skills/<name>/SKILL.md` files or specific plugin manifests, and commits the bumps.

- **Pros**:
  - Can update arbitrary formats (such as YAML frontmatter `metadata.version`) without `release-please` package constraints.
  - Can isolate manifest-only metadata edits (for example, `.codex-plugin/plugin.json` `interface` fields) from other manifests.
- **Cons**:
  - **Cache invalidation risk**: Claude Code and Codex plugin caches key on plugin manifest versions (`.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`).
    Bumping only `SKILL.md` `metadata.version` without bumping the plugin manifests leaves installed client caches stale.
  - **Workflow overlap and races**: Running a custom bumper alongside `release-please` risks competing commits on `main` or `release-please--branches--main`.
    Replacing `release-please` entirely forces the repository to reimplement semver calculation, tag creation, and release PR management.
  - **Validator churn**: Requires extending `skillSchema` in `scripts/skills/validate/skills.ts` and rewriting `validateVersionSync` in `scripts/skills/validate/manifests.ts`.

## Trade-offs summary

| Dimension | Option A: Unified repo versioning | Option B: `release-please` multi-package | Option C: Custom path-based workflow |
| --- | --- | --- | --- |
| Marketplace and plugin cache invalidation | Reliable; every skill change bumps all plugin manifests | Broken or requires `linked-versions` back to Option A | Risky if `SKILL.md` bumps without manifest bumps |
| `validateVersionSync` impact | None; invariant stays intact | Breaks invariant; requires removal or rewrite | Breaks invariant if manifests diverge |
| Changelog and tag noise | Low; one tag and release PR per release | High; per-path manifest entries, tags, and PRs | Medium; extra bot commits or custom release logic |
| Maintenance complexity | Minimal; standard single-package `release-please` | High; custom `generic` markers and linked plugins | High; custom `git diff` bumper and semver logic |

## Operational guidance and revisit triggers

- **Commit hygiene under Option A**: Reserve `feat:` and `fix:` commit prefixes for changes that affect shipped skill content or plugin behavior.
  Use `chore:`, `ci:`, `test:`, or `docs:` for internal tooling (`scripts/`, `tests/`) and repository documentation so non-product changes do not trigger unnecessary plugin releases.
- **When to revisit**: Re-evaluate Option B only if the repository splits into multiple independently installable plugins in `.claude-plugin/marketplace.json` (each with its own `source` directory), or if agent runtimes adopt per-skill version resolution and caching.
