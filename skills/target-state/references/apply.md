[https://www.chezmoi.io/reference/commands/apply/](https://www.chezmoi.io/reference/commands/apply/) - Ensure that target are in the target state, updating them if necessary.

Ensure that targets are in the target state, updating them if necessary.
If no targets are specified, the state of all targets are ensured.
If a target has been modified since chezmoi last wrote it then the user will be prompted if they want to overwrite the file.

## Flags

| Flag | Description |
| --- | --- |
| `--dry-run` | Do not apply changes. |
| `--verbose` | Print the differences of what is applied. |
| `--force` | Apply changes without prompting. |
| `--keep-going` | Keep going on error. |
| `-x, --exclude types` | Exclude target state entries of specific types. |
| `-i, --include types` | Include target state entries of specific types. |
| `--init` | Regenerate and reload the config file from its template before computing the target state. |
| `-P, --parent-dirs` | Execute the command on target and all its parent directories. |
| `-r, --recursive` | Recurse into subdirectories. Enabled by default. Can be disabled with `--recursive=false`. |
| `--source-path` | Specify targets by source path, rather than target path. |

## Examples

```sh
chezmoi apply
chezmoi apply --dry-run
chezmoi apply --verbose
chezmoi apply --dry-run --verbose
chezmoi apply --force
chezmoi apply --exclude scripts
chezmoi apply --include files
chezmoi apply --keep-going
chezmoi apply ~/.bashrc
```
