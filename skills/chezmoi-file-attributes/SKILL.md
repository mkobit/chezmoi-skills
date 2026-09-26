---
name: chezmoi-file-attributes
description: Manage target entry attributes (dot_, private_, executable_, exact_, readonly_, empty_, symlink_, create_, modify_, remove_), target path mapping, and root control files (.chezmoiroot, .chezmoiremove, .chezmoiversion).
---

When you need complete attribute tables or root control directive rules, scan the `references/` directory.

## Target entry attributes

chezmoi encodes permissions, target types, and management behavior into source file and directory name prefixes:

- Target attributes (`dot_`, `private_`, `executable_`, `exact_`, `readonly_`, `empty_`, `symlink_`, `create_`, `modify_`, `remove_`).
- Prefixes compose left to right: `private_dot_ssh/encrypted_private_id_ed25519.age`.

## Root control files

Special control files at the root of the source state configure scope, deletion, and minimum version constraints:

- `.chezmoiroot`: Re-root the target state calculation to a subdirectory.
- `.chezmoiremove`: Define patterns for files to remove during apply.
- `.chezmoiversion`: Enforce a minimum chezmoi version requirement.

## Reference guides

- [attributes.md](references/attributes.md): Complete attribute prefix table, allowed combinations by target type, and path composition examples.
- [directives.md](references/directives.md): Root control directives (`.chezmoiroot`, `.chezmoiremove`, `.chezmoiversion`).

## Related skills

- Consult `chezmoi-cli-commands` for `chezmoi add`, `chezmoi forget`, and `chezmoi destroy`.
- Consult `chezmoi-externals` for external file, archive, and git repository imports.
- Consult `chezmoi-secrets-management` for `encrypted_` prefix workflows.
