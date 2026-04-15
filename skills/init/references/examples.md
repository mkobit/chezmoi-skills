# Chezmoi initialization examples

## Command variations

Initialize using the GitHub username guessing feature.

```bash
chezmoi init username
```

Initialize using an explicit SSH URL and apply immediately.

```bash
chezmoi init --apply git@github.com:username/dotfiles.git
```

Initialize guessing an SSH URL instead of HTTPS.

```bash
chezmoi init --ssh username
```

Initialize targeting a specific branch for testing.

```bash
chezmoi init --branch feature/new-setup username
```

Initialize in a transient CI environment leaving no source state behind.

```bash
chezmoi init --one-shot username
```

## Complex configuration template

This is a comprehensive `.chezmoi.toml.tmpl` example demonstrating advanced templating features.
It utilizes conditionals based on the operating system to selectively prompt for variables.

```toml
{{- $email := "default@example.com" -}}
{{- $name := "Default Name" -}}
{{- $isWork := false -}}

{{- if eq .chezmoi.os "darwin" -}}
{{-   $email = promptStringOnce . "email" "Apple ID Email" -}}
{{-   $name = promptStringOnce . "name" "Full Name" -}}
{{-   $isWork = promptBoolOnce . "isWork" "Is this a work machine?" -}}
{{- else if eq .chezmoi.os "linux" -}}
{{-   $email = promptStringOnce . "email" "Linux Git Email" -}}
{{- end -}}

[data]
    email = {{ $email | quote }}
    name = {{ $name | quote }}
    isWork = {{ $isWork }}

[edit]
    command = "nvim"

[git]
    autoCommit = true
    autoPush = false
```

This template dynamically adjusts its prompts based on whether the host is macOS or Linux.
It stores these values in the `[data]` section, making them available as variables to all other templates in the source state.
The resulting generated TOML file allows the rest of the dotfiles to adapt to the machine's specific context.
