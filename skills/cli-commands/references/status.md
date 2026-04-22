[chezmoi status](https://www.chezmoi.io/reference/commands/status/): Print the status of the files and scripts managed by chezmoi in a format similar to `git status`.

## Output columns

The first column indicates the difference between the last state written by chezmoi and the actual state.
The second column indicates the difference between the actual state and the target state (what `apply` will do).

| Character | Meaning | First column | Second column |
| --- | --- | --- | --- |
| (Space) | No change | No change | No change |
| `A` | Added | Entry was created | Entry will be created |
| `D` | Deleted | Entry was deleted | Entry will be deleted |
| `M` | Modified | Entry was modified | Entry will be modified |
| `R` | Run | Not applicable | Script will be run |

## Common flags

| Flag | Description |
| --- | --- |
| `-x`, `--exclude types` | Exclude target state entries of specific types |
| `-i`, `--include types` | Include target state entries of specific types |
| `--init` | Regenerate and reload the config file from its template |
| `-P`, `--parent-dirs` | Execute the command on target and all its parent directories |
| `-p`, `--path-style style` | Print paths in style (`absolute`, `relative`, `source-absolute`, `source-relative`, `all`) |
| `-r`, `--recursive` | Recurse into subdirectories (enabled by default) |

## Examples

```bash
chezmoi status
```
