---
name: chezmoi-templating
description: Write chezmoi templates using Go text/template syntax, built-in variables, Sprig functions, shared fragments, and prompt functions.
---

When you need complete variable tables, prompt signatures, Sprig function lists, or fragment patterns, scan the `references/` directory.

## Template fundamentals

Source files ending with `.tmpl` are processed using Go `text/template` syntax prior to target application.
The `.tmpl` extension is stripped from the final target path.

```gotmpl
{{ .chezmoi.os }}                         output a value
{{ if eq .chezmoi.os "darwin" }}...{{ end }}   conditional evaluation
{{ range .myList }}{{ . }}{{ end }}       list iteration
{{- ... -}}                               trim surrounding whitespace
{{ "value" | upper }}                     pipe through template function
```

## Previewing and testing templates

- Preview rendered output from stdin: `chezmoi execute-template < dot_gitconfig.tmpl`.
- View rendered target file content: `chezmoi cat ~/.gitconfig`.
- Inspect all available template variables: `chezmoi data`.

## Reference guides

- [built-in-variables.md](references/built-in-variables.md): Built-in `.chezmoi.*` variables (OS, architecture, hostname, directories, kernel).
- [sprig-functions.md](references/sprig-functions.md): Sprig functions and chezmoi-specific functions (`output`, `include`, `joinPath`, `lookPath`).
- [prompt-functions.md](references/prompt-functions.md): Interactive prompt functions for config templates (`promptString`, `promptBool`, `promptInt`, `promptChoice`).
- [shared-template-fragments.md](references/shared-template-fragments.md): Reusable template components stored under `.chezmoitemplates/`.

## Related skills

- Consult `chezmoi-machine-config` for OS, WSL, and distribution branching patterns.
- Consult `chezmoi-secrets-management` for password manager template functions.
- Consult `chezmoi-configuration` for template data injection via `[data]` or `.chezmoidata`.
