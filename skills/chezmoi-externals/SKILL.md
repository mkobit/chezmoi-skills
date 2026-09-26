---
name: chezmoi-externals
description: Include external files, archives, and git repositories in target state using .chezmoiexternal.$FORMAT files.
---

When you need schema declarations, parameter options, or caching rules, scan the `references/` directory.

## External dependency types

chezmoi supports importing third-party resources into the target state using `.chezmoiexternal.$FORMAT` files:

- `file`: Download single files or single compressed files.
- `archive`: Extract directory trees from tarballs or zip archives.
- `archive-file`: Extract single files from zip or tarball archives.
- `git-repo`: Clone or update git repositories into managed paths.

## Reference guides

- [declarations.md](references/declarations.md): Comprehensive guide for `.chezmoiexternal.$FORMAT` schemas (`file`, `archive`, `archive-file`, `git-repo`), field parameters (`exact`, `refreshPeriod`, `stripComponents`, `checksum`, `include`, `exclude`), and refresh/caching mechanisms.

## Related skills

- Consult `chezmoi-file-attributes` for attribute prefix handling in extracted paths.
- Consult `chezmoi-cli-commands` for applying externals with `chezmoi apply --refresh-externals`.
- Consult `chezmoi-templating` for template expansion inside `.chezmoiexternal.$FORMAT.tmpl`.
