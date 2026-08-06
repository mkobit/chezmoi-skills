# Chezmoi chattr command

[chezmoi chattr](https://www.chezmoi.io/reference/commands/chattr/): Modify source state attributes of existing targets directly.

## Usage

```bash
chezmoi chattr attributes target...
```

## Attributes

Attributes are passed as comma-separated modifiers or individual flags.
Prefix attributes with `+` to add them or `-` to remove them.

| Attribute | Description |
| --- | --- |
| `executable` | Mark target file as executable |
| `private` | Mark target file with private permissions (`0600` for files, `0700` for directories) |
| `template` | Treat target file as a Go template |
| `exact` | Mark directory as exact state |
| `readonly` | Mark target file as read-only |
| `encrypted` | Encrypt target file using configured encryption backend |

## Examples

```bash
chezmoi chattr +template ~/.bashrc
chezmoi chattr +private,+executable ~/.local/bin/deploy
chezmoi chattr -template ~/.zshrc
```
