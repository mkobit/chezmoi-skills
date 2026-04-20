---
version: 0.0.1
name: chezmoi-configuration
description: Manage chezmoi.toml/.chezmoi.yaml configuration options and data injection.
---

## Config file location

chezmoi looks for its config file at `~/.config/chezmoi/chezmoi.toml` (preferred) or the XDG config home.
Use `chezmoi doctor` to confirm the path chezmoi is actually using.

## Minimal config example

See [core references](./references/core.md).

```toml
[data]
  email = "user@example.com"
  name = "User Name"
```

## Key top-level options

See [core references](./references/core.md).

| Key | Purpose |
| --- | --- |
| `sourceDir` | Override the source directory (default: `~/.local/share/chezmoi`) |
| `destDir` | Override the target directory (default: `~`) |
| `umask` | Set default file permissions |
| `pager` | Command used to page output (`diff`, `status`, etc.) |
| `color` | `"auto"`, `"true"`, or `"false"` |
| `mode` | `"file"` (default) or `"symlink"` |

## Data injection

See [data references](./references/data.md).

```toml
[data]
  gitEmail = "work@company.com"
  personal = false
  os = "linux"
```

External data files can be placed at `~/.local/share/chezmoi/.chezmoidata.toml` or `.chezmoidata.yaml`.

## Encryption configuration

See [encryption references](./references/encryption.md).

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

See [tool references](./references/tools.md).

```toml
[edit]
  command = "nvim"
  args = []

[diff]
  command = "delta"
  pager = "less"
```

## Merge tool

See [tool references](./references/tools.md).

```toml
[merge]
  command = "nvim"
  args = ["-d", "{{ .Destination }}", "{{ .Source }}", "{{ .Target }}"]
```

## Hooks (run shell commands around operations)

See [hooks references](./references/hooks.md).

```toml
[hooks.apply.pre]
  command = "echo"
  args = ["applying chezmoi"]
```

Supported hook events: `apply`, `add`, `edit`, `update` with `.pre` and `.post` variants.

## Git integration

See [git references](./references/git.md).

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
