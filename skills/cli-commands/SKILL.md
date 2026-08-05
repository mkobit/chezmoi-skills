---
name: chezmoi-cli-commands
description: Execute and look up chezmoi CLI subcommands for managing target directory files, state, and configuration.
---

When you need flags, subcommand options, or usage details, scan the `references/` directory.

## Core workflow commands

- [add.md](references/add.md): Track files from target directory into source state using `chezmoi add`.
- [apply.md](references/apply.md): Ensure target directory matches source state using `chezmoi apply`.
- [update.md](references/update.md): Pull remote changes and re-apply using `chezmoi update`.
- [edit.md](references/edit.md): Edit source files directly in `$EDITOR` using `chezmoi edit`.
- [verify.md](references/verify.md): Assert that target files match computed target state using `chezmoi verify`.
- [misc-core.md](references/misc-core.md): Additional core operations including `chezmoi re-add`, `chezmoi forget`, `chezmoi destroy`, `chezmoi cat`, `chezmoi execute-template`, and `chezmoi archive`.

## Inspection and navigation

- [inspection.md](references/inspection.md): Inspect state and paths using `chezmoi managed`, `chezmoi unmanaged`, `chezmoi source-path`, `chezmoi target-path`, `chezmoi cd`, `chezmoi doctor`, and `chezmoi data`.
- [status.md](references/status.md): Check file status using `chezmoi status`.

## Making and previewing changes

- [diff.md](references/diff.md): View diffs between target state and destination using `chezmoi diff`, or simulate changes with `chezmoi apply --dry-run --verbose`.

## Merging and resolving conflicts

- [merging.md](references/merging.md): Perform three-way merges using `chezmoi merge` and `chezmoi merge-all` when external changes conflict with source state.

## State database management

- [state.md](references/state.md): Inspect and manipulate persistent BoltDB state (script run history, entry checksums) using `chezmoi state`.

## Flags used across commands

Global flags supported across multiple subcommands:

- `--source <dir>` — override source directory path.
- `--destination <dir>` — override destination directory path.
- `--config <file>` — use alternate configuration file.
- `--no-tty` — disable interactive prompts in scripts or CI.
- `-v` / `--verbose` — enable detailed output.
- `-n` / `--dry-run` — simulate execution without modifying files.

## Getting help

Run `chezmoi help` for the full command overview.
Run `chezmoi help <subcommand>` for specific subcommand flags and options.
