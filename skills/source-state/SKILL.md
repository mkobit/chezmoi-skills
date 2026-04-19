---
version: 0.0.1
name: chezmoi-source-state
description: Manage the chezmoi source directory, understanding file states like run_, symlink_, and encrypted_ prefixes.
---

## Source directory location

Default: `~/.local/share/chezmoi`
Override with `sourceDir` in config or `--source` flag.
Open a shell in it: `chezmoi cd`

The source directory is a plain git repository.

## File name prefix system

See also: [Source state attributes](references/attributes.md).

Multiple prefixes compose left to right.

### Attribute prefixes

| Prefix | Meaning |
| --- | --- |
| `dot_` | File/dir name starts with `.` (e.g., `dot_bashrc` → `.bashrc`) |
| `private_` | File permissions `0600`, directory `0700` |
| `executable_` | File permissions `0755` |
| `readonly_` | File permissions are read-only |
| `empty_` | Create the file even if its content is empty |
| `encrypted_` | File is encrypted (age or gpg) |
| `exact_` | Directory: remove target files not present in source |
| `literal_` | File name is used as-is, no prefix interpretation |
| `once_` | *(deprecated, prefer `run_once_`)* |
| `run_` | File is a script, not a dotfile |
| `symlink_` | Create as a symlink in the target |
| `modify_` | Script that modifies an existing target file |
| `create_` | Create file only if it does not already exist |

### Suffix

| Suffix | Meaning |
| --- | --- |
| `.tmpl` | File is a Go template; rendered before applying |
| `.age` | Encrypted with age (added automatically, not manual) |
| `.asc` | Encrypted with gpg (added automatically, not manual) |

### Examples

| Source name | Target path | Notes |
| --- | --- | --- |
| `dot_bashrc` | `~/.bashrc` | Simple dotfile |
| `private_dot_ssh/` | `~/.ssh/` | Directory with `0700` |
| `private_dot_ssh/config` | `~/.ssh/config` | File inside private dir |
| `executable_dot_local/bin/script.sh` | `~/.local/bin/script.sh` | Executable script |
| `dot_gitconfig.tmpl` | `~/.gitconfig` | Rendered as template |
| `encrypted_private_dot_netrc.age` | `~/.netrc` | Encrypted, private |
| `symlink_dot_vim` | `~/.vim` | Symlink |
| `exact_dot_config/git/` | `~/.config/git/` | Exact dir, removes unlisted files |

## Adding files to source state

```sh
chezmoi add ~/.bashrc
chezmoi add --follow ~/.config/nvim   # follow symlinks
chezmoi add --encrypt ~/.ssh/id_ed25519
chezmoi add --template ~/.gitconfig   # treat as template
```

## Inspecting the source state

```sh
chezmoi managed           # list all managed targets
chezmoi source-path ~/.bashrc   # find source for a target file
chezmoi cat ~/.bashrc     # print rendered content of a managed file
chezmoi archive           # tar of the full rendered target state
```

## Removing files from source state

```sh
chezmoi forget ~/.bashrc        # remove from source, keep in target
chezmoi destroy ~/.bashrc       # remove from source AND target
```

## `.chezmoiignore`

See also: [Special files and directories](references/special-files-directories.md).

Create `~/.local/share/chezmoi/.chezmoiignore` to exclude patterns from management:

```gitignore
README.md
*.swp
.DS_Store
```

Supports Go template syntax.

## `.chezmoiexternal.toml`

See also: [Special files and directories](references/special-files-directories.md).

Fetch external files or archives into the source state:

```toml
[".local/bin/gh"]
  type = "file"
  url = "https://github.com/cli/cli/releases/download/v2.x.x/gh_linux_amd64.tar.gz"
  executable = true
  stripComponents = 2
```

## `.chezmoitemplates/`

See also: [Special files and directories](references/special-files-directories.md).

Store shared template fragments here.
Use in other templates: `{{ template "shared-fragment" . }}`

## Git operations on the source directory

See also: [Git operations](references/git-operations.md).

```sh
chezmoi git status
chezmoi git add .
chezmoi git commit -- -m "chore: update dotfiles"
chezmoi git push
```

Or `cd $(chezmoi source-path)` and use git directly.
