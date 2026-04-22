[chezmoi update](https://www.chezmoi.io/reference/commands/update/): Pull changes from the source repo and apply any changes.

If `update.command` is set, chezmoi will run it with `update.args`. Otherwise, it runs `git pull --autostash --rebase [--recurse-submodules]`.

## Flags

| Flag | Description |
| --- | --- |
| `-a`, `--apply` | Apply changes after pulling (true by default) |
| `--recurse-submodules` | Update submodules recursively (true by default) |

## Common flags

| Flag | Description |
| --- | --- |
| `-x`, `--exclude types` | Exclude target state entries of specific types |
| `-i`, `--include types` | Include target state entries of specific types |
| `--init` | Regenerate and reload the config file from its template |
| `-P`, `--parent-dirs` | Execute the command on target and all its parent directories |
| `-r`, `--recursive` | Recurse into subdirectories (enabled by default) |

## Examples

```bash
chezmoi update
chezmoi update --apply=false
```
