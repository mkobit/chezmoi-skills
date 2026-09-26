# Chezmoi dump command

[chezmoi dump](https://www.chezmoi.io/reference/commands/dump/): Write computed target state object model to stdout.

Outputs full representation of computed target state, attributes, contents, and dependencies in structured format (`json` or `yaml`).

## Flags

| Flag | Description |
| --- | --- |
| `-f`, `--format format` | Set output format (`json` or `yaml`, default `json`) |
| `-x`, `--exclude types` | Exclude target state entries of specific types |
| `-i`, `--include types` | Include target state entries of specific types |
| `--init` | Regenerate and reload config file before computing state |

## Examples

```bash
chezmoi dump
chezmoi dump --format yaml
chezmoi dump ~/.bashrc
```
