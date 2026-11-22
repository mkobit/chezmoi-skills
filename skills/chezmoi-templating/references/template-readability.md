# Template readability guide

Use these advisory heuristics when writing or refactoring Go `text/template` code in chezmoi.
Generic auto-formatters cannot parse mixed template and target syntax safely, so clarity depends on local structure and whitespace control.

## Local variable extraction for conditional chains

Extract intermediate boolean variables when a condition nests 3 or more conditional or boolean functions (`and`, `or`, `not`, `eq`, `dig`, `kindIs`) or spans beyond one line.
Keep single-condition checks such as `{{ if eq .chezmoi.os "darwin" }}` inline without extra variables or comments.

**Before:**

```gotmpl
#!/bin/sh
{{- if and (or (eq .head "sbx") (hasPrefix "sbx " .head)) (has .action (list "allow" "prompt" "deny")) -}}
echo "matched"
{{- end -}}
echo "done"
```

**After:**

```gotmpl
#!/bin/sh
{{- $isSbxCmd := or (eq .head "sbx") (hasPrefix "sbx " .head) -}}
{{- $isPolicyAction := has .action (list "allow" "prompt" "deny") -}}
{{- if and $isSbxCmd $isPolicyAction }}
echo "matched"
{{- end }}
echo "done"
```

### Block scoping and guard-safety

Go `text/template` scopes variables to the block where they are declared.
Inside `if`, `range`, or `with`, `$var := ...` creates a new variable that shadows any outer variable of the same name, whereas `$var = ...` reassigns the outer variable.

Do not hoist expressions above an outer `if` or `with` guard if they depend on that guard for safety.
For example, keep `output` calls gated by OS checks and avoid unguarded map indexing before checking key existence.
Consult `os-patterns.md` in `chezmoi-machine-config` for OS and distribution variable-extraction and `=` reassignment patterns.

## Directional whitespace trimming

Use `{{- ... -}}` on standalone variable-assignment or comment lines to remove the entire line and its trailing newline.
Use one-sided trimming (such as `{{- if ... }}` or `{{- end }}`) on control tags that wrap output lines so adjacent output lines do not merge in shell scripts, `modify_` scripts, YAML, or TOML.

**Before (blanket trimming merges `#!/bin/sh` and `echo "matched"`):**

```gotmpl
#!/bin/sh
{{- if eq .chezmoi.os "linux" -}}
echo "matched"
{{- end -}}
```

**After (directional trimming preserves line breaks):**

```gotmpl
#!/bin/sh
{{- if eq .chezmoi.os "linux" }}
echo "matched"
{{- end }}
```

Verify rendered whitespace with `chezmoi execute-template`, and pipe the output to target validators such as `jq`, `yq`, `shfmt`, or `shellcheck` when needed.

## Short comments

Use `{{- /* ... */ -}}` on standalone lines (or `{{/* ... */}}` inline) to explain why a non-obvious check exists, not what standard template functions do.

```gotmpl
#!/bin/sh
{{- /* sbx subcommands share policy rules with the bare sbx binary */ -}}
{{- $isSbxCmd := or (eq .head "sbx") (hasPrefix "sbx " .head) -}}
{{- if $isSbxCmd }}
echo "matched"
{{- end }}
```

## Pipeline formatting and fragment boundaries

Split multi-stage pipelines (4 or more function calls) across intermediate variables instead of nesting them on one line.

**Before:**

```gotmpl
{{- $slug := replace " " "-" (trim (lower .chezmoi.hostname)) | trunc 16 -}}
host={{ $slug }}
```

**After:**

```gotmpl
{{- $normalizedHost := .chezmoi.hostname | lower | trim | replace " " "-" -}}
{{- $slug := trunc 16 $normalizedHost -}}
host={{ $slug }}
```

When the same template logic is repeated across multiple files, extract it into `.chezmoitemplates/` instead of duplicating it inline; see [shared-template-fragments.md](shared-template-fragments.md).
