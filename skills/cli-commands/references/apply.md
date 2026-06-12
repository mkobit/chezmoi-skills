[chezmoi apply](https://www.chezmoi.io/reference/commands/apply/): Apply the source state to the target directory.

Ensure that `target...` are in the target state, updating them if necessary.
If no targets are specified, the state of all targets is ensured.
If a target has been modified since chezmoi last wrote it then the user will be prompted if they want to overwrite the file.

## Flags

| Flag | Description |
| --- | --- |
| `-x`, `--exclude types` | Exclude target state entries of specific types |
| `-i`, `--include types` | Include target state entries of specific types |
| `--init` | Regenerate and reload the config file from its template before computing the target state |
| `-P`, `--parent-dirs` | Execute the command on target and all its parent directories |
| `-r`, `--recursive` | Recurse into subdirectories (enabled by default, disable with `--recursive=false`) |
| `--source-path` | Specify targets by source path, rather than target path (useful for applying changes after editing) |

## Global flags often used with apply

| Flag | Description |
| --- | --- |
| `-n`, `--dry-run` | Simulate without making changes |
| `-v`, `--verbose` | Print the differences that would be made |
| `--force` | Apply changes without prompting |
| `-k`, `--keep-going` | Keep going on error |

## Examples

```sh
chezmoi apply
chezmoi apply --dry-run --verbose
chezmoi apply --force
chezmoi apply --exclude scripts
chezmoi apply ~/.bashrc
```
