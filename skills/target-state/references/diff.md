[https://www.chezmoi.io/reference/commands/diff/](https://www.chezmoi.io/reference/commands/diff/) - Print the difference between the target state and the destination state.

If a `diff.pager` command is set in the configuration file then the output will be piped into it.

If `diff.command` is set then it will be invoked to show individual file differences with `diff.args` passed as arguments. Each element of `diff.args` is interpreted as a template with the variables `.Destination` and `.Target` available corresponding to the path of the file in the source and target state respectively. The default value of `diff.args` is `["{{ .Destination }}", "{{ .Target }}"]`.

## Flags

| Flag | Description |
| --- | --- |
| `--pager pager` | Pager to use for output (`diff.pager` in config). |
| `--reverse` | Reverse the direction of the diff (`diff.reverse` in config). |
| `--script-contents` | Show script contents, defaults to true. |
| `-x, --exclude types` | Exclude target state entries of specific types. |
| `-i, --include types` | Include target state entries of specific types. |
| `--init` | Regenerate and reload the config file from its template before computing the target state. |
| `-P, --parent-dirs` | Execute the command on target and all its parent directories. |
| `-r, --recursive` | Recurse into subdirectories. |

## Examples

```sh
chezmoi diff
chezmoi diff ~/.bashrc
```
