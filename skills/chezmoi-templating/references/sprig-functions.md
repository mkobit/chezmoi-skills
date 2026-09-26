# Template functions

- [Sprig function library](https://masterminds.github.io/sprig/): all Sprig functions (string, list, dict, math, path, encoding, and OS helpers) are available in chezmoi templates.
- [chezmoi template functions](https://www.chezmoi.io/reference/templates/functions/): functions added by chezmoi, summarized below.

## File and path functions

| Function | Description |
| --- | --- |
| `joinPath elements...` | Join path elements into a single path |
| `lookPath file` | Search for an executable in the current `$PATH`; empty string if not found |
| `findExecutable file path-list` | Search for an executable in the given directories; empty string if not found |
| `findOneExecutable file-list path-list` | First executable from `file-list` found in `path-list` directories |
| `isExecutable path` | True if the file is executable |
| `stat name` | Structured file info if `name` exists (`name`, `size`, `mode`, `perm`, `modTime`, `isDir`, `type`); false value if not |
| `lstat name` | Like `stat` but does not follow symlinks |
| `glob pattern` | Files matching a doublestar pattern; relative paths resolved against the destination directory |
| `globCaseInsensitive pattern` | Case-insensitive `glob` |

## Command execution

| Function | Description |
| --- | --- |
| `output name [args...]` | Returns the command's stdout; template execution fails if the command errors |
| `outputList name [args...]` | Like `output`, but returns a list of lines |
| `exec name [args...]` | Runs the command and returns `true`/`false` for success; output is ignored |

Command functions execute every time the template is executed — commands must be idempotent and fast.

## Data conversion

| Function | Description |
| --- | --- |
| `fromJsonc str` / `fromToml str` / `fromYaml str` / `fromIni str` | Decode a document into a dict |
| `toToml dict` / `toYaml dict` / `toIni dict` | Encode a value into a string |
| `jq query input` | Run a jq query against input; returns a list of results |

## Including files and templates

| Function | Description |
| --- | --- |
| `include filename` | Literal contents of the file; relative paths resolved against the source directory |
| `includeTemplate filename [data]` | Execute the file's contents as a template with optional data; relative paths searched in `.chezmoitemplates/` first, then the source directory |

## Utility functions

| Function | Description |
| --- | --- |
| `abortEmpty val` | Abort template evaluation with error if string or collection is empty |
| `comment prefix text` | Prefix every line of `text` with `prefix` string |
| `completion shell` | Output shell completion script for specified shell (`bash`, `zsh`, `fish`, `powershell`) |
| `debugf format args...` | Output formatted debug message to stderr without aborting |
| `warnf format args...` | Output formatted warning message to stderr |
| `decrypt path` | Decrypt file contents using configured encryption backend |
| `encrypt text` | Encrypt string using configured encryption backend |
| `ensureLinePrefix prefix text` | Ensure every non-empty line of `text` starts with `prefix` |
| `eqFold string1 string2 [extra...]` | True if the strings are equal under Unicode case-folding |
| `getRedirectedURL url` | Return final URL after following HTTP redirects |
| `hexDecode str` / `hexEncode str` | Hexadecimal decode or encode strings |
| `ioreg class` | Query macOS IORegistry data for specified hardware class |
| `mozillaInstallHash path` | Compute Mozilla/Firefox profile installation hash for path |
| `quoteList list` | Quote each element of a list |
| `replaceAllRegex expr repl text` | Replace all regex matches in `text` |
| `setValueAtPath path value dict` | Set a value at a `.`-separated path in a dict |
| `deleteValueAtPath path dict` | Delete the value at a `.`-separated path in a dict |
| `pruneEmptyDicts dict` | Remove nested empty dicts, bottom up |
| `shellQuote str` / `shellQuoteList list` | Escape strings or list of strings safely for shell invocation |
| `stdinIsATTY` | Return true if standard input is an interactive TTY terminal |
| `toPrettyJson val` | Encode value into formatted multi-line JSON string |
| `toString val` / `toStrings list` | Convert value or list of values to strings |

## GitHub API functions

| Function | Description |
| --- | --- |
| `gitHubKeys username` | Fetch SSH public keys for a GitHub user |
| `gitHubLatestRelease repo` | Fetch the latest release object for a GitHub repository (`owner/repo`) |
| `gitHubLatestTag repo` | Fetch the latest tag string for a GitHub repository (`owner/repo`) |
| `gitHubReleases repo` | Fetch all release objects for a GitHub repository (`owner/repo`) |
| `gitHubTags repo` | Fetch all tag objects for a GitHub repository (`owner/repo`) |

## `chezmoi:template:` inline directives

Control template parsing directly inside template files using top-line comment directives:

```gotmpl
# chezmoi:template:left-delimiter=[[ right-delimiter=]] encoding=utf-8-bom format-indent=2 line-endings=lf missing-key=error
```

Supported options:

- `left-delimiter` / `right-delimiter` — customize template tag delimiters (e.g. `[[` and `]]`).
- `encoding` — specify output file encoding (`utf-8`, `utf-8-bom`, `utf-16-be`, `utf-16-be-bom`, `utf-16-le`, `utf-16-le-bom`).
- `format-indent` / `format-indent-width` — set indentation width in spaces for `toJson`, `toYaml`, `toToml`.
- `line-endings` — force output line endings (`crlf`, `lf`, `native`).
- `missing-key` — control missing map key behavior (`error`, `invalid`, `zero`).

## Secret manager functions

Functions for password managers (`bitwarden`, `onepassword`, `pass`, `vault`, `keepassxc`, etc.) are owned by the chezmoi-secrets-management skill.
