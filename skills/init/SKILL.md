---
version: 0.0.1
name: chezmoi-init
description: Initialize and set up chezmoi, including bare repository handling and initial configuration.
---

# Chezmoi initialization

The `chezmoi init` command clones a dotfiles repository to the source directory and creates the initial configuration.
Pass a repository url as an argument.
Use the `--apply` flag to apply dotfiles immediately after initialization.
Use the `--depth 1` flag for a shallow clone.

## Configuration file

The configuration file is generated at `~/.config/chezmoi/chezmoi.toml`.
It is generated dynamically from a template file in the source directory named `.chezmoi.toml.tmpl`.
This file is evaluated during initialization.

## Init functions

When reading `.chezmoi.toml.tmpl`, use `promptString` and `promptBool` functions for user input.
This sets up machine-specific configurations like email or hostname.

## Secrets and destination

The configuration file can store secrets or reference password managers.
Chezmoi automatically handles the destination of the generated configuration file.

## Templating example

```toml
{{ $email := promptStringOnce . "email" "Email address" -}}
[data]
    email = {{ $email | quote }}
```

## References

Review [Examples](./references/examples.md) for detailed configuration options.
Review [Docs](./references/docs.md) for official documentation.
