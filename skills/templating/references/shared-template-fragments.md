[Shared template fragments](https://www.chezmoi.io/user-guide/templating/#using-chezmoitemplates) - Official documentation for using the `.chezmoitemplates/` directory.

Files in the `.chezmoitemplates` subdirectory of the source directory are parsed as templates and can be included in other templates. The filename is used as the template name.

## Invoking a shared template

By default, shared templates are executed with `nil` data context. To access variables like `.chezmoi.os` within the shared template, you must pass the context (`.`).

**Example: `dot_file.tmpl`**

```gotmpl
{{ template "part.tmpl" . }}
```

## Passing multiple arguments to a shared template

You can pass data to a shared template by using a dictionary.

**Example: `dot_file.tmpl`**

```gotmpl
{{- template "alacritty" dict "fontsize" 12 "font" "DejaVu Sans Mono" -}}
```

**Example fragment: `.chezmoitemplates/alacritty`**

```gotmpl
some: config
fontsize: {{ .fontsize }}
font: {{ .font }}
more: config
```

You can also define structured data in `chezmoi.toml` under `[data]` and pass that sub-object instead of creating a `dict` on the fly:

**`chezmoi.toml`**

```toml
[data.alacritty.small]
    fontsize = 12
    font = "DejaVu Sans Mono"
```

**Example: `dot_file.tmpl`**

```gotmpl
{{- template "alacritty" .alacritty.small -}}
```
