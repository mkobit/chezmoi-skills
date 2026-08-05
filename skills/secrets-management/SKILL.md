---
name: chezmoi-secrets-management
description: Integrate with password managers (Bitwarden, 1Password, etc.) and manage encrypted files using age or gpg.
---

When you need detailed syntax examples, full function signatures, or backend configurations, scan the `references/` directory.

## Approaches to secrets

chezmoi supports two strategies for secrets in dotfiles:

1. **Template functions** — fetch secrets dynamically at apply time from a password manager or secret store.
2. **Encrypted files** — store secrets encrypted in the source repository using `age` or `gpg`.

Use template functions when credentials rotate frequently or are managed centrally.
Use encrypted files when credentials need to be stored directly in the repository.

## Secret templates in config

Password manager functions can be used directly in `chezmoi.toml.tmpl`:

```toml
[data]
  gitSigningKey = {{ onepasswordRead "op://vault/GPG Key/public key" | quote }}
```

## Best practices

- Store the `age` identity or `gpg` private key outside the source repository.
- Rotate secrets in the password manager rather than modifying chezmoi templates.
- Consult [password-managers.md](references/password-managers.md) for template function signatures and examples.
- Consult [encryption.md](references/encryption.md) for `age` and `gpg` setup guides and naming patterns.
