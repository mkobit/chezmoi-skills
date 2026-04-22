[chezmoi diff](https://www.chezmoi.io/reference/commands/diff/): Print the difference between the target state and the destination state for targets.

If no targets are specified, print the differences for all targets.

If `diff.command` is set in your configuration, it will be invoked to show individual file differences (e.g., using an external diff tool). The command will use `diff.args` with the variables `{{ .Destination }}` and `{{ .Target }}` for the target and source paths.

## Flags

| Flag | Description |
| --- | --- |
| `--pager pager` | Pager to use for output (configurable via `diff.pager`) |
| `--reverse` | Reverse the direction of the diff (show changes to the target required to match the destination) |
| `--script-contents` | Show script contents (defaults to true) |

## Common flags

| Flag | Description |
| --- | --- |
| `-x`, `--exclude types` | Exclude target state entries of specific types |
| `-i`, `--include types` | Include target state entries of specific types |
| `--init` | Regenerate and reload the config file from its template before computing target state |
| `-P`, `--parent-dirs` | Execute the command on target and all its parent directories |
| `-r`, `--recursive` | Recurse into subdirectories |

## Examples

```bash
chezmoi diff
chezmoi diff ~/.bashrc
```
