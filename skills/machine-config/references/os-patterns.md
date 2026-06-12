# OS and hostname patterns

Patterns for branching on operating system, distribution, architecture, hostname, and other machine traits.

## OS conditionals

```gotmpl
{{ if eq .chezmoi.os "darwin" -}}
# macOS contents
{{ else if eq .chezmoi.os "linux" -}}
# Linux contents
{{ end -}}
```

`.chezmoi.os` values come from Go's `runtime.GOOS`: `linux`, `darwin`, `windows`, `freebsd`, etc.
`.chezmoi.arch` comes from `runtime.GOARCH`: `amd64`, `arm64`, etc.

## Linux distribution conditionals

`.chezmoi.osRelease` exposes `/etc/os-release` fields (Linux only), e.g. `.chezmoi.osRelease.id` is `"debian"`, `"fedora"`, etc.

Because `text/template` evaluates conditionals eagerly, distribution checks must be nested inside an OS check:

```gotmpl
{{ if eq .chezmoi.os "linux" }}
{{   if eq .chezmoi.osRelease.id "debian" }}
# Debian-specific
{{   end }}
{{ end }}
```

### Combined `osid` variable

Flatten the nesting by defining a combined variable in the config file template (`.chezmoi.$FORMAT.tmpl`):

```gotmpl
{{- $osid := .chezmoi.os -}}
{{- if hasKey .chezmoi.osRelease "id" -}}
{{-   $osid = printf "%s-%s" .chezmoi.os .chezmoi.osRelease.id -}}
{{- end -}}

[data]
    osid = {{ $osid | quote }}
```

Then conditionals are flat:

```gotmpl
{{ if eq .osid "darwin" }}
# macOS-specific
{{ else if eq .osid "linux-debian" }}
# Debian-specific
{{ else if eq .osid "linux-fedora" }}
# Fedora-specific
{{ end }}
```

## WSL detection

WSL kernels contain `microsoft` in the kernel release string:

```gotmpl
{{ if eq .chezmoi.os "linux" }}
{{   if (.chezmoi.kernel.osrelease | lower | contains "microsoft") }}
# WSL-specific
{{   end }}
{{ end }}
```

## Hostname conditionals

`.chezmoi.hostname` is the hostname up to the first `.`; use `.chezmoi.fqdnHostname` for the fully-qualified name.

```gotmpl
{{- if eq .chezmoi.hostname "work-laptop" }}
# only on work-laptop
{{- end }}
```

## Completely different files per machine

When inline conditionals get unwieldy, keep separate source files and select one.

Plain content — use `include` (paths relative to the source directory):

```gotmpl
{{- if eq .chezmoi.os "darwin" -}}
{{-   include ".bashrc_darwin" -}}
{{- else if eq .chezmoi.os "linux" -}}
{{-   include ".bashrc_linux" -}}
{{- end -}}
```

Files starting with `.` (like `.bashrc_darwin`) are not installed by chezmoi, so they need no ignore entries.

Templated content — put fragments in `.chezmoitemplates/` and use `template` with `.` to pass data:

```gotmpl
{{- if eq .chezmoi.os "darwin" -}}
{{-   template "bashrc_darwin.tmpl" . -}}
{{- else if eq .chezmoi.os "linux" -}}
{{-   template "bashrc_linux.tmpl" . -}}
{{- end -}}
```

## Same contents, different target locations

For one file that lives at different paths per OS (e.g., macOS `Library/Application Support/` vs Linux `~/.config/`):

1. Put the shared content in `.chezmoitemplates/file.conf`.
2. Create a `.tmpl` at each OS-specific target path containing `{{- template "file.conf" . -}}`.
3. Ignore each path on the other OS in `.chezmoiignore`:

```gotmpl
{{ if ne .chezmoi.os "darwin" }}
Library/Application Support/App/file.conf
{{ end }}
{{ if ne .chezmoi.os "linux" }}
.config/app/file.conf
{{ end }}
```

## Removing a file on some machines

If a template renders to empty contents, the target file is removed.
Use an `empty_` source name prefix if an empty file should be kept instead.

## Detecting hardware traits

Detect facts with the `output` function in the config file template and store them under `[data]` so target templates stay fast and simple.
Example: chassis type (laptop vs desktop):

```gotmpl
{{- $chassisType := "desktop" }}
{{- if eq .chezmoi.os "darwin" }}
{{-   if contains "MacBook" (output "system_profiler" "SPHardwareDataType") }}
{{-     $chassisType = "laptop" }}
{{-   end }}
{{- else if eq .chezmoi.os "linux" }}
{{-   $chassisType = (output "hostnamectl" "--json=short" | mustFromJson).Chassis }}
{{- end }}

[data]
    chassisType = {{ $chassisType | quote }}
```
