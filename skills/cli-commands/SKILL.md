---
version: 0.0.1
name: chezmoi-cli-commands
description: Understand and execute chezmoi CLI commands and subcommands effectively.
---

## Core workflow commands

| Command | Purpose |
| --- | --- |
| [`chezmoi add <file>`](./references/add.md) | Track a file from the target directory into the source state |
| [`chezmoi apply`](./references/apply.md) | Apply the source state to the target directory |
| [`chezmoi diff`](./references/diff.md) | Show what `apply` would change |
| [`chezmoi status`](./references/status.md) | Show the state of each managed file |
| [`chezmoi update`](./references/update.md) | Pull remote changes and apply them |
| [`chezmoi re-add`](./references/misc-core.md) | Re-add modified target files back to the source state |
| [`chezmoi edit <file>`](./references/edit.md) | Open a managed file in `$EDITOR` inside the source directory |
| [`chezmoi forget <file>`](./references/misc-core.md) | Stop tracking a file without removing it from the target |

## Inspection and navigation

- [`chezmoi managed`](./references/inspection.md) — list all managed files and directories
- [`chezmoi unmanaged`](./references/inspection.md) — list files in the target directory not tracked by chezmoi
- [`chezmoi source-path <file>`](./references/inspection.md) — print the source path for a target file
- [`chezmoi target-path <file>`](./references/inspection.md) — print the target path for a source file
- [`chezmoi cd`](./references/inspection.md) — open a shell in the source directory
- [`chezmoi doctor`](./references/inspection.md) — verify the installation and report potential issues
- [`chezmoi data`](./references/inspection.md) — print available template data as JSON

## Making and previewing changes

Use `chezmoi apply --dry-run` to simulate without writing.
Use `chezmoi apply --verbose` for per-file detail.

## Merging and resolving conflicts

- [`chezmoi merge <file>`](./references/merging.md) — three-way merge a file with conflicts
- [`chezmoi merge-all`](./references/merging.md) — merge all files with conflicts at once
- Set `merge.command` in config to customize the merge tool

## Archive and state inspection

- [`chezmoi archive`](./references/state.md) — create a tar archive of the target state
- [`chezmoi state`](./references/state.md) — inspect the internal bolt database (script run history, etc.)
- `chezmoi state delete-bucket --bucket=scriptState` — clear script run history

## Flags used across commands

- `--source <dir>` — override the source directory
- `--destination <dir>` — override the target (home) directory
- `--config <file>` — use an alternate config file
- `--no-tty` — disable interactive prompts (useful in CI)
- `-v` / `--verbose` — increase output verbosity
- `-n` / `--dry-run` — simulate without making changes

## Getting help

Run `chezmoi help` for a full command list.
Run `chezmoi help <command>` for subcommand details.
