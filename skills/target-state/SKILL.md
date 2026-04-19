---
version: 0.0.1
name: chezmoi-target-state
description: Manage the target directory state, understanding chezmoi apply, updates, and diffs.
---

## What is the target state?

The target state is the desired end result: what your home directory should look like after chezmoi runs.
chezmoi computes the target state from the source state (including rendering templates and decrypting files), then compares it to what is actually on disk.

## Core commands

### Preview changes before applying

```sh
chezmoi diff
```

### Apply the target state

```sh
chezmoi apply
```

Only files that differ from the target state are updated.

```sh
chezmoi apply --dry-run       # simulate, do not write
chezmoi apply --verbose       # show each file action
chezmoi apply --force         # overwrite conflicts without prompting
chezmoi apply ~/.bashrc       # apply only specific files
```

### Check current status

```sh
chezmoi status
```

Output columns:

| Column | Meaning |
| --- | --- |
| First | Source state change (A=added, M=modified, D=deleted) |
| Second | Target state (A=added, M=modified, D=deleted) |
| Path | Target file path |

### Verify the target state matches disk

```sh
chezmoi verify
```

Exits non-zero if any managed file differs from the target state.
Useful in CI or scheduled checks.

## Updating from remote

```sh
chezmoi update
```

Equivalent to `chezmoi git pull` followed by `chezmoi apply`.

## Target directory defaults

The default target directory is `$HOME`.
Override globally in config:

```toml
destDir = "/custom/target"
```

Or per-run:

```sh
chezmoi apply --destination /custom/target
```

## Conflict resolution

When a target file has been modified outside chezmoi, `apply` reports it as modified.

Options:

- `chezmoi diff <file>` — inspect what changed
- `chezmoi merge <file>` — three-way merge (disk vs source vs last apply)
- `chezmoi apply --force <file>` — overwrite with source state
- `chezmoi re-add <file>` — update the source to match the current disk state

## Exact directories

Directories prefixed with `exact_` in the source state cause chezmoi to remove target files not present in the source.
Use this to keep config directories tightly controlled:

```text
exact_dot_config/git/     # any file in ~/.config/git/ not tracked here will be deleted on apply
```

## `create_` files

Files prefixed with `create_` are only written if the target file does not already exist.

## Checking what chezmoi would do to a specific file

```sh
chezmoi diff ~/.gitconfig
chezmoi cat ~/.gitconfig     # print the rendered target content
chezmoi status ~/.gitconfig
chezmoi verify ~/.gitconfig
```

## State database

chezmoi records run-once script state and last-apply checksums in:

```text
~/.local/share/chezmoi/chezmoistate.boltdb
```

Inspect it:

```sh
chezmoi state dump
```

This database is local to each machine and is not committed to the source repo.
