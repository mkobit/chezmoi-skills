[chezmoi edit](https://www.chezmoi.io/reference/commands/edit/): Edit the source state of targets, which must be files or symlinks.

If no targets are given then the working tree of the source directory is opened. Encrypted files are decrypted to a temporary directory for editing, then re-encrypted upon save.

## Flags

| Flag | Description |
| --- | --- |
| `-a`, `--apply` | Apply the target immediately after editing (ignored with no targets; does not apply scripts) |
| `--hardlink bool` | Invoke the editor with a hard link to the source file (default true) |
| `--watch` | Automatically apply on save (requires targets as arguments, working `edit.hardlink`, and an fsnotify-supported OS) |

## Common flags

| Flag | Description |
| --- | --- |
| `-x`, `--exclude types` | Exclude target state entries of specific types |
| `-i`, `--include types` | Include target state entries of specific types |
| `--init` | Regenerate and reload the config file from its template |

## Examples

```bash
chezmoi edit ~/.bashrc
chezmoi edit ~/.bashrc --apply
chezmoi edit
```
