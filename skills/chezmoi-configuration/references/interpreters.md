# Interpreters configuration

[interpreters](https://www.chezmoi.io/reference/configuration-file/interpreters/): Custom script interpreter configurations mapping file extension to command and arguments.

## Overview

Interpreter keys drop leading dots in extensions (for example, `nu` for `.nu` scripts).
When executing scripts, chezmoi checks for interpreter definitions before falling back to system defaults.
On Windows, chezmoi falls back from `pwsh` to `powershell` if `pwsh` is not found in `$PATH`.

## Schema

```toml
[interpreters.nu]
command = "nu"
args = ["--no-config-file"]

[interpreters.py]
command = "python3"

[interpreters.ps1]
command = "pwsh"
args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass"]
```

## Default mappings

Default interpreter mappings supported natively:

- `.nu` — Nushell (`nu`)
- `.pl` — Perl (`perl`)
- `.py` — Python (`python3` or `python`)
- `.ps1` — PowerShell (`pwsh` or `powershell`)
- `.rb` — Ruby (`ruby`)
