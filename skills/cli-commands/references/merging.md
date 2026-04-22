# Chezmoi merge commands

- [chezmoi merge](https://www.chezmoi.io/reference/commands/merge/): Perform a three-way merge between the destination state, the target state, and the source state for each target.
- [chezmoi merge-all](https://www.chezmoi.io/reference/commands/merge-all/): Perform a three-way merge for file whose actual state does not match its target state.

## Configuration

The merge tool is defined by the `merge.command` configuration variable (defaults to `vimdiff`).

The order of arguments to `merge.command` is set by `merge.args`. Each argument is interpreted as a template with the variables `.Destination`, `.Source`, and `.Target`. The default value is `["{{ .Destination }}", "{{ .Source }}", "{{ .Target }}"]`.

## `merge-all` flags

| Flag | Description |
| --- | --- |
| `--init` | Regenerate and reload the config file from its template before computing target state |
| `-r`, `--recursive` | Recurse into subdirectories (enabled by default) |

## Examples

```bash
chezmoi merge ~/.bashrc
chezmoi merge-all
```
