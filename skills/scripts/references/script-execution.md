# Script execution and naming

Chezmoi uses filename prefixes to determine when and how scripts are executed.

## Prefix Composition and Order

Prefixes can be composed left-to-right. For example, a script named `run_once_before_install-packages.sh` will:

1. Only run once (`once_`)
2. Run before any dotfiles are modified (`before_`)

Scripts within the same phase (e.g., `before_`, `after_`) run in lexicographical (alphabetical) order. You can use numeric prefixes like `00-` or `01-` to control the exact order.

## Script Environment Variables

Chezmoi sets several environment variables when running scripts to provide context:

- `CHEZMOI=1`: Always set to `1` so scripts can detect they are being run by chezmoi.
- `CHEZMOI_SOURCE_DIR`: The path to the source directory.
- `CHEZMOI_SOURCE_PATH`: The path to the script in the source directory.
- Template data: Variables like `CHEZMOI_OS` and `CHEZMOI_ARCH` are also exposed as environment variables, often as JSON.

## `run_onchange_` Content Hashing

For `run_onchange_` scripts, chezmoi tracks changes by hashing the script's content. If the script is a template (ends with `.tmpl`), chezmoi hashes the **generated template output**, not the raw source template text. This means the script will re-run if any template variables it depends on change.

## Multi-platform Install Scripts

You can use templates to write install scripts that adapt to the current operating system.

### Example: Install packages

```sh
{{ if eq .chezmoi.os "linux" -}}
#!/bin/bash
sudo apt-get install -y ripgrep
{{ else if eq .chezmoi.os "darwin" -}}
#!/bin/bash
brew install ripgrep
{{ end -}}
```
