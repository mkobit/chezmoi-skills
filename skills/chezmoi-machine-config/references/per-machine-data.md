# Per-machine data

Where to define machine-varying template data and how the sources combine.

## Data sources

| Source | Location | Templated? | Committed to repo? |
| --- | --- | --- | --- |
| Config file `[data]` | `~/.config/chezmoi/chezmoi.$FORMAT` | Generated from `.chezmoi.$FORMAT.tmpl` on `chezmoi init` | No (per-machine, local) |
| `.chezmoidata.$FORMAT` | Source state (any directory) | No | Yes |
| `.chezmoidata/` directory files | Source state | No | Yes |

Rule of thumb: machine-specific values (email, work vs personal, detected facts) belong in the config file `[data]` section; static values shared by all machines belong in `.chezmoidata`.

`.chezmoidata` files cannot be templates because they are read before the template engine starts.

## Prompting for machine values on init

Generate the per-machine config with `.chezmoi.$FORMAT.tmpl` in the source state root.
Prompts run on `chezmoi init`, not on `apply`:

```gotmpl
{{- $email := promptString "email" -}}
{{- $work := promptBool "work machine" -}}
[data]
    email = {{ $email | quote }}
    work = {{ $work }}
```

Prompt function reference is in the chezmoi-templating skill.

## Machine roles as boolean flags

Branch on role flags instead of repeating hostname checks:

```gotmpl
{{ if .work -}}
[user]
    email = "first.last@company.com"
{{- else -}}
[user]
    email = "me@home.org"
{{- end }}
```

Re-run `chezmoi init` (without a repo argument) to regenerate the config file after changing `.chezmoi.$FORMAT.tmpl`.

## Merge rules

- All `.chezmoidata.$FORMAT` files and files in `.chezmoidata/` directories merge into the root of the data dictionary.
- Files are read in lexical (alphabetic) filesystem order; later files win for conflicting keys.
- Only dictionaries are merged; all other values (including lists) are replaced.
- Variable names must start with a letter, followed by letters and/or digits.

## Inspecting the result

```sh
chezmoi data            # full merged data as JSON
chezmoi execute-template '{{ .email }}'   # test a single value
```

If the config file stores private values (tokens), ensure it has permissions `0600`.
