---
name: chezmoi-configuration
description: "Configure chezmoi behavior: source/target dirs, data injection, encryption, editor, diff/merge tools, git auto-commit, and operation hooks."
---

## Config file location

chezmoi reads its config file from `~/.config/chezmoi/chezmoi.$FORMAT`, where `$FORMAT` is one of `json`, `jsonc`, `toml`, or `yaml`.
If multiple formats are present, chezmoi reports an error.
Use `chezmoi doctor` to confirm the path chezmoi is actually using.

## Minimal config example

```toml
[data]
  email = "user@example.com"
  name = "User Name"
```

## Key top-level options

| Key | Purpose |
| --- | --- |
| `sourceDir` | Override the source directory (default: `~/.local/share/chezmoi`) |
| `destDir` | Override the target directory (default: `~`) |
| `umask` | Set default file permissions |
| `pager` | Command used to page output (`diff`, `status`, etc.) |
| `color` | `"auto"`, `"true"`, or `"false"` |
| `mode` | `"file"` (default) or `"symlink"` |

See `references/core.md` for a full list of top-level options.

## Data injection

```toml
[data]
  gitEmail = "work@company.com"
  personal = false
  os = "linux"
```

Static data can also live in `.chezmoidata.$FORMAT` files in the source directory.

See `references/data.md` for more on data injection and templating.

## Encryption configuration

The top-level `encryption` option (`age`, `gpg`, or `transparent`) plus an `[age]` or `[gpg]` section configure encrypted files.
`encryption` must appear before any section in the config file.
The chezmoi-secrets-management skill owns encryption setup, key generation, and workflows.

## Editor and diff settings

```toml
[edit]
  command = "nvim"
  args = []

[diff]
  command = "delta"
  pager = "less"
```

## Merge tool

```toml
[merge]
  command = "nvim"
  args = ["-d", "{{ .Destination }}", "{{ .Source }}", "{{ .Target }}"]
```

See `references/tools.md` for full configuration properties of `[edit]`, `[diff]`, and `[merge]`.

## Hooks (run shell commands around operations)

```toml
[hooks.apply.pre]
  command = "echo"
  args = ["applying chezmoi"]
```

Hooks can be defined for any command (`apply`, `add`, `update`, ...) plus the `git-auto-commit`, `git-auto-push`, and `read-source-state` events, each with `.pre` and `.post` variants.
Hooks always run, even with `--dry-run`.

See `references/hooks.md` for more hook examples and configurations.

## Git integration

```toml
[git]
  autoCommit = true
  autoPush = false
  commitMessageTemplate = "chore: update dotfiles"
```

With `autoCommit = true`, chezmoi commits whenever a change is made to the source directory.

See `references/git.md` for a full list of `[git]` configuration options.

## Multiple machine profiles

Do not use multiple config files — use a single `.chezmoi.$FORMAT.tmpl` config template to branch per machine.
The chezmoi-machine-config skill owns multi-machine patterns.
