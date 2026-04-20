---
version: 0.0.1
name: chezmoi-configuration
description: Manage chezmoi.toml/.chezmoi.yaml configuration options and data injection.
---

When you need detailed examples, full lists of config file options, or external documentation links, scan the `references/` directory.

## Config file location

chezmoi looks for its config file at `~/.config/chezmoi/chezmoi.toml` (preferred) or the XDG config home.
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

## Data injection

```toml
[data]
  gitEmail = "work@company.com"
  personal = false
  os = "linux"
```

External data files can be placed at `~/.local/share/chezmoi/.chezmoidata.toml` or `.chezmoidata.yaml`.

## Encryption configuration

### age

```toml
encryption = "age"

[age]
  identity = "~/.config/chezmoi/key.txt"
  recipient = "age1..."
```

### gpg

```toml
encryption = "gpg"

[gpg]
  recipient = "user@example.com"
```

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

## Hooks (run shell commands around operations)

```toml
[hooks.apply.pre]
  command = "echo"
  args = ["applying chezmoi"]
```

Supported hook events: `apply`, `add`, `edit`, `update` with `.pre` and `.post` variants.

## Git integration

```toml
[git]
  autoCommit = true
  autoPush = false
  commitMessageTemplate = "chore: update dotfiles"
```

With `autoCommit = true`, chezmoi commits after each `add` or `re-add`.

## Multiple machine profiles

Use template conditionals with `.chezmoi.hostname` or custom `[data]` flags to vary behavior per machine.
Do not use multiple config files — use templates to branch within one config.
