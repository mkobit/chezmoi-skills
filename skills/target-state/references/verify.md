[https://www.chezmoi.io/reference/commands/verify/](https://www.chezmoi.io/reference/commands/verify/) - Verify that all targets match their target state.

Verify that all targets match their target state.
chezmoi exits with code 0 (success) if all targets match their target state, or 1 (failure) otherwise.
If no targets are specified then all targets are checked.

## Flags

| Flag | Description |
| --- | --- |
| `-x, --exclude types` | Exclude target state entries of specific types. |
| `-i, --include types` | Include target state entries of specific types. |
| `--init` | Regenerate and reload the config file from its template before computing the target state. |
| `-P, --parent-dirs` | Execute the command on target and all its parent directories. |
| `-r, --recursive` | Recurse into subdirectories. Enabled by default. Can be disabled with `--recursive=false`. |

## Examples

Useful in CI or scheduled checks:

```sh
chezmoi verify
chezmoi verify ~/.bashrc
```
