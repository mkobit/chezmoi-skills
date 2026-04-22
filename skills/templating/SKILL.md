---
version: 0.0.1
name: chezmoi-templating
description: 'Write chezmoi templates: OS/machine conditionals, user-defined data variables, Sprig functions, shared fragments, and interactive prompts.'
---

**Fact:** Any source file with the `.tmpl` suffix is treated as a Go `text/template`. chezmoi renders it before writing to the target directory. The `.tmpl` extension is stripped from the target filename.

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

See [built-in-variables.md](references/built-in-variables.md) for more details.

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

See [sprig-functions.md](references/sprig-functions.md) for a complete list of Sprig and chezmoi functions.

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

See [shared-template-fragments.md](references/shared-template-fragments.md) for more details.

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

See [prompt-functions.md](references/prompt-functions.md) for more prompt functions.

Prompts only fire on `chezmoi init`, not on subsequent `apply` runs.

## Testing templates

Render a template without applying it:

```sh
chezmoi execute-template < ~/.local/share/chezmoi/dot_gitconfig.tmpl
chezmoi cat ~/.gitconfig
```

## Common mistakes

| Mistake | Symptom | Fix |
| --- | --- | --- |
| Forgetting to add `.tmpl` suffix | file is copied verbatim, template not rendered | Add `.tmpl` suffix to filename |
| Using `{{ }}` without whitespace control (`{{-` / `-}}`) | unexpected blank lines in output | Use whitespace control markers |
| Referencing `.chezmoi.hostname` before calling `chezmoi init` | data is only available after initialization | Call `chezmoi init` first |
| Using `promptString` outside of `chezmoi.toml.tmpl` | prompts only work in the config template | Move prompt to `chezmoi.toml.tmpl` |
