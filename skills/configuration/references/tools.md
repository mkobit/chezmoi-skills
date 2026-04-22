# Editor, Diff, and Merge Tools

Reference: <https://www.chezmoi.io/reference/configuration-file/variables/#top-level>
Configure the tools used for editing, diffing, and merging files.

## Edit

| Variable | Type | Default | Description |
| --- | --- | --- | --- |
| `edit.apply` | `bool` | `false` | Apply changes on exit. |
| `edit.args` | `[]string` | `none` | Extra args to edit command. |
| `edit.command` | `string` | `$EDITOR` / `$VISUAL` | Edit command. |
| `edit.hardlink` | `bool` | `true` | Invoke editor with a hardlink to the source file. |
| `edit.minDuration` | `duration` | `1s` | Minimum duration for edit command. |
| `edit.watch` | `bool` | `false` | Automatically apply changes when files are saved. |

### Edit Example

```toml
[edit]
  command = "nvim"
  args = []
```

```toml
[edit]
  command = "code"
  args = ["--wait"]
```

## Diff

| Variable | Type | Default | Description |
| --- | --- | --- | --- |
| `diff.args` | `[]string` | see docs | Extra args to external diff command. |
| `diff.command` | `string` | `none` | External diff command. |
| `diff.exclude` | `[]string` | `none` | Entry types to exclude from diffs. |
| `diff.pager` | `string` | `none` | Diff-specific pager. |
| `diff.pagerArgs` | `[]string` | `none` | Extra args to the diff-specific pager command. |
| `diff.reverse` | `bool` | `false` | Reverse order of arguments to diff. |
| `diff.scriptContents` | `bool` | `true` | Show script contents. |

### Diff Example

```toml
[diff]
  command = "delta"
  pager = "less"
```

```toml
[diff]
  command = "diff-so-fancy"
```

## Merge

| Variable | Type | Default | Description |
| --- | --- | --- | --- |
| `merge.args` | `[]string` | see docs | Extra args to three-way merge CLI command. |
| `merge.command` | `string` | `none` | Three-way merge CLI command. |

### Merge Example

```toml
[merge]
  command = "nvim"
  args = ["-d", "{{ .Destination }}", "{{ .Source }}", "{{ .Target }}"]
```
