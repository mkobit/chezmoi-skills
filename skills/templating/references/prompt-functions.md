[Init functions](https://www.chezmoi.io/reference/templates/init-functions/) - Official documentation for interactive prompt functions used during chezmoi init.

These template functions are only available when generating a config file with `chezmoi init`. For testing with `chezmoi execute-template`, pass the `--init` flag to enable them. If the command line flag `--promptDefaults` is set, all prompts return their default values, if available.

## Prompt Functions

| Function Signature | Description |
| --- | --- |
| `promptBool prompt` | Prompts for a boolean value (e.g. `true`, `false`, `yes`, `no`) |
| `promptBool prompt default` | Prompts for a boolean value with a default fallback |
| `promptBoolOnce dictionary key prompt [default]` | Prompts for a boolean only if `key` is not already set in `dictionary` |
| `promptChoice prompt choices` | Prompts the user to select one string from a list of `choices` |
| `promptChoice prompt choices default` | Prompts to select from `choices` with a default choice |
| `promptChoiceOnce dictionary key prompt choices [default]` | Prompts for a choice only if `key` is not already set in `dictionary` |
| `promptInt prompt` | Prompts for an integer |
| `promptInt prompt default` | Prompts for an integer with a default fallback |
| `promptIntOnce dictionary key prompt [default]` | Prompts for an integer only if `key` is not already set in `dictionary` |
| `promptString prompt` | Prompts for a string |
| `promptString prompt default` | Prompts for a string with a default fallback |
| `promptStringOnce dictionary key prompt [default]` | Prompts for a string only if `key` is not already set in `dictionary` |
| `promptMultichoice prompt choices` | Prompts the user to select multiple strings from a list of `choices` |
| `promptMultichoice prompt choices default` | Prompts for multiple choices with default choices |
| `promptMultichoiceOnce dictionary key prompt choices [default]` | Prompts for multiple choices only if `key` is not already set in `dictionary` |

## Other Init Functions

| Function Signature | Description |
| --- | --- |
| `writeToStdout args...` | Writes its arguments to standard output |
| `exit code` | Exits chezmoi immediately with the given integer `code` |
