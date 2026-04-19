---
version: 0.0.1
name: chezmoi-templating
description: Use text/template, Sprig functions, and data variables from .chezmoidata for templating.
---

## What is a template?

Any source file with the `.tmpl` suffix is treated as a Go `text/template`.
chezmoi renders it before writing to the target directory.
The `.tmpl` extension is stripped from the target filename.

## Built-in chezmoi template data

Available as `.chezmoi.*` in every template:

| Variable | Example value |
| --- | --- |
| `.chezmoi.os` | `"linux"`, `"darwin"`, `"windows"` |
| `.chezmoi.arch` | `"amd64"`, `"arm64"` |
| `.chezmoi.hostname` | `"my-laptop"` |
| `.chezmoi.username` | `"alice"` |
| `.chezmoi.homeDir` | `"/home/alice"` |
| `.chezmoi.sourceDir` | `"/home/alice/.local/share/chezmoi"` |
| `.chezmoi.group` | Primary group name |
| `.chezmoi.kernel.osRelease` | Linux `/etc/os-release` fields (Linux only) |

Print all available data:

```sh
chezmoi data
```

## User-defined data

Add values to `chezmoi.toml` under `[data]`:

```toml
[data]
  email = "alice@example.com"
  workMachine = true
```

Access in templates: `{{ .email }}`, `{{ .workMachine }}`

External data files at `.chezmoidata.toml` or `.chezmoidata.yaml` in the source directory are also merged in.

## Go template syntax

```gotmpl
{{ .chezmoi.os }}                         output a value
{{ if eq .chezmoi.os "darwin" }}...{{ end }}   conditional
{{ range .myList }}{{ . }}{{ end }}       iteration
{{- ... -}}                               trim surrounding whitespace
{{ "value" | upper }}                     pipe into a function
```

## Conditionals by OS or machine

```gotmpl
[core]
  autocrlf = {{ if eq .chezmoi.os "windows" }}true{{ else }}false{{ end }}
```

```gotmpl
{{ if .workMachine -}}
[user]
  signingkey = {{ .gpgWorkKey }}
{{- else -}}
[user]
  signingkey = {{ .gpgPersonalKey }}
{{- end }}
```

## Sprig functions

chezmoi includes the [Sprig](http://masterminds.github.io/sprig/) function library.
Common Sprig functions:

| Function | Use |
| --- | --- |
| `upper` / `lower` | Change case |
| `trim` / `trimAll` | Strip whitespace or characters |
| `contains` | Substring check |
| `default` | Provide a fallback value |
| `required` | Fail if value is empty |
| `toJson` / `fromJson` | JSON encode/decode |
| `splitList` | Split string into list |
| `join` | Join list into string |
| `env` | Read environment variable |
| `include` | Include another template by name |

## Shared template fragments (`.chezmoitemplates/`)

Place reusable fragments in `.chezmoitemplates/` in the source dir:

```text
.chezmoitemplates/
  git-identity
```

`git-identity`:

```gotmpl
[user]
  name = {{ .name }}
  email = {{ .email }}
```

Use in another template:

```gotmpl
{{ template "git-identity" . }}
```

## Interactive prompts

Use prompt functions in `chezmoi.toml.tmpl` to gather input on init:

```gotmpl
{{- $email := promptString "email" -}}
[data]
  email = {{ $email | quote }}
```

| Function | Behavior |
| --- | --- |
| `promptString "label"` | Prompt for a string |
| `promptString "label" "default"` | Prompt with a default |
| `promptBool "label"` | Prompt for true/false |
| `promptInt "label"` | Prompt for an integer |
| `promptChoice "label" list` | Prompt from a list |

Prompts only fire on `chezmoi init`, not on subsequent `apply` runs.

## Testing templates

Render a template without applying it:

```sh
chezmoi execute-template < ~/.local/share/chezmoi/dot_gitconfig.tmpl
chezmoi cat ~/.gitconfig
```

## Common mistakes

- Forgetting to add `.tmpl` suffix — file is copied verbatim, template not rendered
- Using `{{ }}` without whitespace control (`{{-` / `-}}`) — unexpected blank lines in output
- Referencing `.chezmoi.hostname` before calling `chezmoi init` — data is only available after initialization
- Using `promptString` outside of `chezmoi.toml.tmpl` — prompts only work in the config template
