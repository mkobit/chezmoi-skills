---
name: chezmoi-source-state
description: Work with the chezmoi source directory, file naming prefixes, external dependencies, special directories, and git operations.
---

When you need complete attribute prefix tables, external file schemas, or special directory rules, scan the `references/` directory.

## Source directory location

The chezmoi source directory defaults to `~/.local/share/chezmoi` and is a plain Git repository.
Run `chezmoi cd` to open a shell in the source directory.

## File name prefix system

chezmoi uses prefixes and suffixes to encode file attributes, permissions, and behavior into source filenames:

- Attributes (`dot_`, `private_`, `executable_`, `readonly_`, `empty_`, `encrypted_`, `exact_`, `literal_`, `symlink_`, `modify_`, `create_`).
- Suffixes (`.tmpl` for templates, `.age`/`.asc` for encrypted files).

Prefixes compose left to right: `private_dot_ssh/encrypted_private_id_ed25519.age`.

## Reference guides

- [attributes.md](references/attributes.md): Complete list of attribute prefixes, suffixes, and target path mapping examples.
- [special-files-directories.md](references/special-files-directories.md): Special control files (`.chezmoiignore`, `.chezmoiroot`, `.chezmoitemplates/`, `.chezmoiversion`).
- [externals.md](references/externals.md): External file, archive, and git repository declarations in `.chezmoiexternal.$FORMAT`.
- [git-operations.md](references/git-operations.md): Running Git commands on the source directory manually or via `chezmoi git`.

## Related skills

- Consult `chezmoi-cli-commands` for `chezmoi add`, `chezmoi forget`, and `chezmoi destroy`.
- Consult `chezmoi-configuration` for configuring `git.autoCommit` and `git.autoPush`.
- Consult `chezmoi-secrets-management` for encrypted file workflows.
