# Script execution and naming

Reference: <https://www.chezmoi.io/user-guide/use-scripts-to-perform-actions/>
chezmoi uses filename prefixes to determine when and how scripts are executed.

## Prefix composition and order

Prefixes compose left to right.
For example, `run_once_before_install-packages.sh` will:

1. Only run once per unique content (`once_`)
2. Run before any dotfiles are updated (`before_`)

Scripts are executed in alphabetical order.
Scripts without `before_`/`after_` run interleaved with file updates in target-name order.
Use numeric prefixes like `00-` or `01-` to control the exact order.

## Environment variables

chezmoi sets environment variables when running scripts:

- `CHEZMOI=1`: always set so scripts can detect they are being run by chezmoi.
- Template data such as `CHEZMOI_OS` and `CHEZMOI_ARCH`.

Set extra environment variables for scripts, hooks, and commands with `scriptEnv` in the config file:

```toml
[scriptEnv]
  MY_VAR = "my_value"
```

## Content hashing

chezmoi tracks `run_once_` and `run_onchange_` scripts by the SHA256 hash of their content.
If the script is a template (ends with `.tmpl`), chezmoi hashes the generated template output, not the raw source text.
The script re-runs if any template variable it depends on changes the output.

## Multi-platform install scripts

Use templates to write install scripts that adapt to the current operating system:

```sh
{{ if eq .chezmoi.os "linux" -}}
#!/bin/bash
sudo apt-get install -y ripgrep
{{ else if eq .chezmoi.os "darwin" -}}
#!/bin/bash
brew install ripgrep
{{ end -}}
```

If the template renders to empty or whitespace-only output, the script is not executed.
