---
version: 0.0.1
name: chezmoi-cli-commands
description: "Look up and run chezmoi commands: add, apply, diff, status, update, edit, merge, re-add, and other core operations."
---

## Core workflow commands

| Command | Purpose |
| --- | --- |
| `chezmoi add <file>` | Track a file from the target directory into the source state |
| `chezmoi apply` | Apply the source state to the target directory |
| `chezmoi diff` | Show what `apply` would change |
| `chezmoi status` | Show the state of each managed file |
| `chezmoi update` | Pull remote changes and apply them |
| `chezmoi re-add` | Re-add modified target files back to the source state |
| `chezmoi edit <file>` | Open a managed file in `$EDITOR` inside the source directory |
| `chezmoi forget <file>` | Stop tracking a file without removing it from the target |
| `chezmoi cat <file>` | Print the rendered target content of a managed file |
| `chezmoi verify` | Exit non-zero if any managed file differs from target state |
| `chezmoi execute-template` | Render a template string or file without applying |

[See references/add.md](references/add.md)
[See references/apply.md](references/apply.md)

## Inspection and navigation

- `chezmoi managed` — list all managed files and directories
- `chezmoi unmanaged` — list files in the target directory not tracked by chezmoi
- `chezmoi source-path <file>` — print the source path for a target file
- `chezmoi target-path <file>` — print the target path for a source file
- `chezmoi cd` — open a shell in the source directory
- `chezmoi doctor` — verify the installation and report potential issues
- `chezmoi data` — print available template data as JSON

[See references/inspection.md](references/inspection.md)
[See references/status.md](references/status.md)

## Making and previewing changes

Use `chezmoi apply --dry-run` to simulate without writing.
Use `chezmoi apply --verbose` for per-file detail.

[See references/diff.md](references/diff.md)

## Merging and resolving conflicts

- `chezmoi merge <file>` — three-way merge a file with conflicts
- `chezmoi merge-all` — merge all files with conflicts at once
- Set `merge.command` in config to customize the merge tool

[See references/merging.md](references/merging.md)

## Archive and state inspection

- `chezmoi archive` — create a tar archive of the target state
- `chezmoi state` — inspect the internal bolt database (script run history, etc.)
- `chezmoi state delete-bucket --bucket=scriptState` — clear script run history

[See references/state.md](references/state.md)

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
