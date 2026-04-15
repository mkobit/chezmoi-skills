# Chezmoi initialization examples

## Basic initialization

Initialize chezmoi with a repository.

```bash
chezmoi init https://github.com/username/dotfiles.git
```

## Initialization with immediate apply

Initialize and apply the configuration in a single command.

```bash
chezmoi init --apply https://github.com/username/dotfiles.git
```

## Templated configuration file

Example `.chezmoi.toml.tmpl` using prompts and assigning variables.

```toml
{{- $email := promptStringOnce . "email" "Email address" -}}
{{- $name := promptStringOnce . "name" "Full name" -}}

[data]
    email = {{ $email | quote }}
    name = {{ $name | quote }}

[edit]
    command = "vim"
```

This template prompts the user for an email and a name if not already set.
The generated file is stored as `~/.config/chezmoi/chezmoi.toml`.
