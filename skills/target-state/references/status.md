[https://www.chezmoi.io/reference/commands/status/](https://www.chezmoi.io/reference/commands/status/) - Print the status of the files and scripts managed by chezmoi.

Print the status of the files and scripts managed by chezmoi in a format similar to `git status`.

## Output columns

The first column of output indicates the difference between the last state written by chezmoi and the actual state.
The second column indicates the difference between the actual state and the target state, and what effect running `chezmoi apply` will have.

| Character | Meaning | First column | Second column |
| --- | --- | --- | --- |
| `Space` | No change | No change | No change |
| `A` | Added | Entry was created | Entry will be created |
| `D` | Deleted | Entry was deleted | Entry will be deleted |
| `M` | Modified | Entry was modified | Entry will be modified |
| `R` | Run | Not applicable | Script will be run |

## Flags

| Flag | Description |
| --- | --- |
| `-x, --exclude types` | Exclude target state entries of specific types. |
| `-i, --include types` | Include target state entries of specific types. |
| `--init` | Regenerate and reload the config file from its template before computing the target state. |
| `-P, --parent-dirs` | Execute the command on target and all its parent directories. |
| `-p, --path-style style` | Print paths in the given style (`absolute`, `relative`, `source-absolute`, `source-relative`, `all`). |
| `-r, --recursive` | Recurse into subdirectories. Enabled by default. Can be disabled with `--recursive=false`. |

## Examples

```sh
chezmoi status
```
