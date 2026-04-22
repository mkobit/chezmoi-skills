[https://www.chezmoi.io/reference/commands/merge/](https://www.chezmoi.io/reference/commands/merge/) and [https://www.chezmoi.io/reference/commands/merge-all/](https://www.chezmoi.io/reference/commands/merge-all/) - Perform a three-way merge between states.

Perform a three-way merge between the destination state, the target state, and the source state for each target.
The merge tool is defined by the `merge.command` configuration variable, and defaults to `vimdiff`.

If the target state cannot be computed (for example if source is a template containing errors or an encrypted file that cannot be decrypted) a two-way merge is performed instead.

## Configuring the merge tool

The merge tool is defined by the `merge.command` configuration variable, and defaults to `vimdiff`.
You can configure it to use tools like `nvim -d` or `meld`.

The order of arguments to `merge.command` is set by `merge.args`.
Each argument is interpreted as a template with the variables `.Destination`, `.Source`, and `.Target` available corresponding to the path of the file in the destination state, the source state, and the target state respectively.
The default value of `merge.args` is `["{{ .Destination }}", "{{ .Source }}", "{{ .Target }}"]`.

## Flags

| Flag | Description |
| --- | --- |
| `--init` | Regenerate and reload the config file from its template before computing the target state. |
| `-r, --recursive` | Recurse into subdirectories. Enabled by default. Can be disabled with `--recursive=false`. |

## Examples

```sh
chezmoi merge ~/.bashrc
chezmoi merge-all
```
