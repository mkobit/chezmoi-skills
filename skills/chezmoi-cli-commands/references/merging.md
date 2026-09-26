# Chezmoi merge commands

- [chezmoi merge](https://www.chezmoi.io/reference/commands/merge/): Perform a three-way merge between the destination state, the target state, and the source state for each target.
- [chezmoi merge-all](https://www.chezmoi.io/reference/commands/merge-all/): Perform a three-way merge for each file whose actual state does not match its target state.

If the target state cannot be computed (for example if source is a template containing errors or an encrypted file that cannot be decrypted) a two-way merge is performed instead.

## Configuration

The merge tool is defined by the `merge.command` configuration variable (defaults to `vimdiff`).

The order of arguments to `merge.command` is set by `merge.args`.
Each argument is interpreted as a template with the variables `.Destination`, `.Source`, and `.Target` available corresponding to the path of the file in the destination state, the source state, and the target state respectively.
The default value of `merge.args` is `["{{ .Destination }}", "{{ .Source }}", "{{ .Target }}"]`.

## Flags

| Flag | Description |
| --- | --- |
| `--init` | Regenerate and reload the config file from its template before computing the target state |
| `-r`, `--recursive` | Recurse into subdirectories (enabled by default, disable with `--recursive=false`) |

## Examples

```sh
chezmoi merge ~/.bashrc
chezmoi merge-all
```
