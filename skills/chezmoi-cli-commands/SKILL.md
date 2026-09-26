---
name: chezmoi-cli-commands
description: Execute and look up chezmoi CLI subcommands for managing target directory files, state, and configuration.
---

When you need flags, subcommand options, or usage details, scan the `references/` directory.

## Core workflow commands

- [add.md](references/add.md): Track files into source state (`chezmoi add`).
- [apply.md](references/apply.md): Ensure target directory matches source state (`chezmoi apply`).
- [update.md](references/update.md): Pull remote changes and re-apply (`chezmoi update`).
- [edit.md](references/edit.md): Edit source files directly (`chezmoi edit`).
- [verify.md](references/verify.md): Assert target files match target state (`chezmoi verify`).
- [chattr.md](references/chattr.md): Modify source entry attributes (`chezmoi chattr`).
- [import.md](references/import.md): Import archives into source state (`chezmoi import`).
- [dump.md](references/dump.md): Output target state object model (`chezmoi dump`).
- [misc-core.md](references/misc-core.md): Core operations including `re-add`, `forget`, `destroy`, `cat`, `execute-template`, `completion`, `upgrade`, and `archive`.

## Inspection and navigation

- [inspection.md](references/inspection.md): Inspect state (`managed`, `unmanaged`, `source-path`, `target-path`, `cd`, `doctor`, `data`).
- [status.md](references/status.md): Check file status (`chezmoi status`).

## Making and previewing changes

- [diff.md](references/diff.md): View diffs using `chezmoi diff` or simulate with `apply --dry-run --verbose`.

## Merging and resolving conflicts

- [merging.md](references/merging.md): Three-way merge conflict resolution (`chezmoi merge`, `chezmoi merge-all`).

## State database management

- [state.md](references/state.md): Inspect and manipulate persistent BoltDB state (`chezmoi state`).

## Flags used across commands

Global flags supported across subcommands:

- `--source <dir>` — override source directory.
- `--destination <dir>` — override destination directory.
- `--config <file>` — use alternate config file.
- `--color <auto|always|never>` — control colorized output.
- `--use-builtin-age <bool>` — use builtin age implementation.
- `--use-builtin-git <bool>` — use builtin git implementation.
- `--no-pager` / `--no-tty` — disable pager or TTY prompts.
- `-v` / `--verbose` / `-n` / `--dry-run` — verbose mode or dry run.

## Getting help

Run `chezmoi help` or `chezmoi help <subcommand>` for subcommand options.
