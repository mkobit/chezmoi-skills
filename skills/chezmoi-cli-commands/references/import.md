# Chezmoi import command

[chezmoi import](https://www.chezmoi.io/reference/commands/import/): Import archive files directly into source state.

Supported archive formats include `.tar`, `.tar.gz`, `.tgz`, `.tar.bz2`, `.tbz2`, `.tar.xz`, `.txz`, `.tar.zst`, `.zip`, and `.rar`.

## Flags

| Flag | Description |
| --- | --- |
| `--destination dir` | Set destination directory prefix for imported files |
| `--exact` | Set the exact attribute on imported directories |
| `-x`, `--exclude types` | Exclude target state entries of specific types |
| `-i`, `--include types` | Include target state entries of specific types |
| `--remove-destination` | Remove destination directory before importing |
| `--strip-components n` | Strip specified number of leading path components from archive entries |

## Examples

```bash
chezmoi import archive.tar.gz
chezmoi import --strip-components 1 archive.zip
chezmoi import --destination ~/.config/helm helm-config.tar.gz
```
