# Chezmoi inspection and navigation commands

- [chezmoi managed](https://www.chezmoi.io/reference/commands/managed/): List all managed entries in the destination directory.
- [chezmoi unmanaged](https://www.chezmoi.io/reference/commands/unmanaged/): List all unmanaged files in the destination directory.
- [chezmoi source-path](https://www.chezmoi.io/reference/commands/source-path/): Print the path to each target's source state.
- [chezmoi target-path](https://www.chezmoi.io/reference/commands/target-path/): Print the target path of each source path.
- [chezmoi cd](https://www.chezmoi.io/reference/commands/cd/): Launch a shell in the working tree (typically the source directory).
- [chezmoi doctor](https://www.chezmoi.io/reference/commands/doctor/): Check for potential problems.
- [chezmoi data](https://www.chezmoi.io/reference/commands/data/): Write the computed template data to stdout.

## `managed` and `unmanaged` flags

| Flag | Description |
| --- | --- |
| `-x`, `--exclude types` | Exclude target state entries of specific types |
| `-i`, `--include types` | Include target state entries of specific types |
| `-p`, `--path-style style` | Print paths in style (`absolute`, `relative`, `source-absolute`, `source-relative`, `all`) |
| `-t`, `--tree` | Print paths as a tree instead of a list |
| `-f`, `--format` | Output format (json or yaml, `managed` only) |

## `doctor` flags

| Flag | Description |
| --- | --- |
| `--no-network` | Do not use any network connections |

## `data` flags

| Flag | Description |
| --- | --- |
| `-f`, `--format` | Set the output format (json or yaml, default is json) |

## Examples

```bash
chezmoi managed --include=files,symlinks
chezmoi unmanaged ~/.config/chezmoi ~/.ssh
chezmoi source-path ~/.bashrc
chezmoi target-path ~/.local/share/chezmoi/dot_zshrc
chezmoi cd ~/.config
chezmoi doctor --no-network
chezmoi data --format=yaml
```
