# Hooks

Reference: <https://www.chezmoi.io/reference/configuration-file/hooks/>
Hook commands are executed before and after events. Unlike scripts, hooks are always run, even if `--dry-run` is specified. Hooks should be fast and idempotent.

## Supported Hook Events

The following events are defined:

| Event | Trigger |
| --- | --- |
| `command` | Running chezmoi commands such as `apply`, `add`, `edit`, `update`, `init`, etc. |
| `git-auto-commit` | Generating an automatic git commit |
| `git-auto-push` | Running an automatic git push |
| `read-source-state` | Reading the source state |

Each event can have a `.pre` and/or a `.post` command. The `event.pre` command is executed before the event occurs and the `event.post` command is executed after the event has occurred.

A hook contains a `command` or `script` and an optional array of strings `args`. `commands` are executed directly. `scripts` are executed with configured interpreter for the script's extension.

## Hook Variables

| Variable | Type | Default | Description |
| --- | --- | --- | --- |
| `hooks.command.post.args` | `[]string` | `none` | Extra arguments to command to run after command. |
| `hooks.command.post.command` | `[]string` | `none` | Command to run after command. |
| `hooks.command.pre.args` | `[]string` | `none` | Extra arguments to command to run before command. |
| `hooks.command.pre.command` | `[]string` | `none` | Command to run before command. |

## Environment Variables during Hooks

When running hooks, the `CHEZMOI=1` and `CHEZMOI_*` environment variables will be set:

- `CHEZMOI_COMMAND` is set to the chezmoi command being run
- `CHEZMOI_COMMAND_DIR` is set to the directory where chezmoi was run from
- `CHEZMOI_ARGS` contains the full arguments to chezmoi

## Examples

```toml
[hooks.read-source-state.pre]
  command = "echo"
  args = ["pre-read-source-state-hook"]

[hooks.apply.post]
  command = "echo"
  args = ["post-apply-hook"]

[hooks.add.post]
  script = "post-add-hook.ps1"
```
