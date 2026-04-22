[chezmoi add](https://www.chezmoi.io/reference/commands/add/): Tracks a file from the target directory into the source state.

## Flags

| Flag | Description |
| --- | --- |
| `-a`, `--autotemplate` | Automatically generate a template by replacing strings that match variable values |
| `--create` | Add files that should exist, irrespective of their contents |
| `--encrypt` | Encrypt files using the defined encryption method |
| `--exact` | Set the exact attribute on added directories |
| `--follow` | Add the target of the symlink instead of the symlink itself |
| `--new` | Create a new file if the target does not exist |
| `-p`, `--prompt` | Interactively prompt before adding each file |
| `-q`, `--quiet` | Suppress warnings about adding ignored entries |
| `--secrets ignore\|warning\|error` | Action to take when a secret is found |
| `-T`, `--template` | Set the template attribute on added files and symlinks |
| `--template-symlinks` | Create a symlink template with `.chezmoi.sourceDir` or `.chezmoi.homeDir` |

## Common flags

| Flag | Description |
| --- | --- |
| `-x`, `--exclude types` | Exclude target state entries of specific types |
| `-f`, `--force` | Add targets, even if doing so would cause a source template to be overwritten |
| `-i`, `--include types` | Include target state entries of specific types |
| `-r`, `--recursive` | Recurse into subdirectories (enabled by default) |

## Examples

```bash
chezmoi add ~/.bashrc
chezmoi add ~/.gitconfig --template
chezmoi add ~/.ssh/id_rsa --encrypt
chezmoi add ~/.vim --recursive
chezmoi add ~/.oh-my-zsh --exact --recursive
```
