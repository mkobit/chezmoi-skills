[https://www.chezmoi.io/reference/commands/update/](https://www.chezmoi.io/reference/commands/update/) - Pull changes from the source repo and apply any changes.

Pull changes from the source repo and apply any changes.

If `update.command` is set then chezmoi will run `update.command` with `update.args` in the working tree.
Otherwise, chezmoi will run `git pull --autostash --rebase [--recurse-submodules]`, using chezmoi's builtin git if `useBuiltinGit` is true or if `git.command` cannot be found in `$PATH`.

## Flags

| Flag | Description |
| --- | --- |
| `-a, --apply` | Apply changes after pulling, true by default. Can be disabled with `--apply=false`. |
| `--recurse-submodules` | Update submodules recursively. This defaults to true. Can be disabled with `--recurse-submodules=false`. |
| `-x, --exclude types` | Exclude target state entries of specific types. |
| `-i, --include types` | Include target state entries of specific types. |
| `--init` | Regenerate and reload the config file from its template before computing the target state. |
| `-P, --parent-dirs` | Execute the command on target and all its parent directories. |
| `-r, --recursive` | Recurse into subdirectories. Enabled by default. Can be disabled with `--recursive=false`. |

## Examples

```sh
chezmoi update
```
