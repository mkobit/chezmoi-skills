---
name: chezmoi-secrets-management
description: Integrate with password managers (Bitwarden, 1Password, etc.) and manage encrypted files using age or gpg.
---

When you need detailed examples, full lists of template functions for password managers, or external documentation links, scan the `references/` directory.

## Approaches to secrets

chezmoi supports two strategies for secrets in dotfiles:

1. **Template functions** — fetch secrets at apply time from a password manager
2. **Encrypted files** — store secrets encrypted in the source repository (age or gpg)

Use template functions for secrets that may rotate.
Use encrypted files for static credentials or keys you want in-repo.

## Password manager template functions

### 1Password

| Function | Signature |
| --- | --- |
| `onepasswordRead` | `onepasswordRead url [account]` |
| `onepassword` | `onepassword uuid [vault [account]]` |
| `onepasswordDetailsFields` | `onepasswordDetailsFields uuid [vault [account]]` |
| `onepasswordDocument` | `onepasswordDocument uuid [vault [account]]` |

```gotmpl
{{ onepasswordRead "op://vault/item/field" }}
{{ (onepassword "$UUID").fields }}
{{ (onepasswordDetailsFields "$UUID").password.value }}
{{- onepasswordDocument "$UUID" -}}
```

`onepassword` and `onepasswordDetailsFields` return structured data parsed from `op` JSON output, not plain strings.
Requires the `op` CLI; chezmoi prompts to sign in if there is no valid session.

### Bitwarden

```gotmpl
{{ (bitwarden "item" "$ITEMID").login.password }}
{{ (bitwardenFields "item" "$ITEMID").token.value }}
{{- bitwardenAttachment "$FILENAME" "$ITEMID" -}}
```

`bitwarden` and `bitwardenFields` pass their arguments to `bw get` unchanged and parse the JSON output; `bitwardenFields` indexes the `fields` array by field `name`.
Requires `bw` CLI and the `BW_SESSION` env var, or set `bitwarden.unlock = "auto"` in config to run `bw unlock --raw` automatically.

### pass / gopass

```gotmpl
{{ pass "path/to/secret" }}
{{ (passFields "path/to/secret").password }}
{{ gopass "path/to/secret" }}
```

`pass` and `gopass` return only the first line of output; `passRaw` and `gopassRaw` return the full output.

### KeePassXC

```gotmpl
{{ (keepassxc "Entry Name").Password }}
{{ keepassxcAttribute "Entry Name" "attribute" }}
{{- keepassxcAttachment "Entry Name" "filename" -}}
```

Requires `keepassxc-cli` and `keepassxc.database` set in config.

### OS keyring (macOS Keychain, GNOME Keyring, Windows Credentials Manager)

```gotmpl
{{ keyring "service" "user" }}
```

Set values with:

```sh
chezmoi secret keyring set --service=$SERVICE --user=$USER
```

### Vault (HashiCorp)

```gotmpl
{{ (vault "$KEY").data.data.password }}
```

`vault` takes a single key, passes it to `vault kv get -format=json $KEY`, and returns the parsed JSON.

### Generic: any CLI secret tool

```toml
[secret]
    command = "vault"
```

```gotmpl
{{ secret "arg" }}
{{ secretJSON "kv" "get" "-format=json" "$ID" }}
```

`secret` returns raw command output with whitespace trimmed; `secretJSON` parses the output as JSON.

## Encrypted files with age

### Age setup

```toml
# chezmoi.toml
encryption = "age"

[age]
  identity = "~/.config/chezmoi/key.txt"
  recipient = "age1..."
```

`encryption` must be set at the top level before any section; use `identities`/`recipients` (plural, lists) for multiple keys.

Generate a key (`chezmoi age-keygen` works without `age` installed):

```sh
chezmoi age-keygen --output ~/.config/chezmoi/key.txt
```

### Add an encrypted file with age

```sh
chezmoi add --encrypt ~/.ssh/id_ed25519
```

chezmoi stores the file as `private_dot_ssh/encrypted_private_id_ed25519.age` in the source (`encrypted_` applies to files only, never directories).

### Decryption at apply time

The identity file must be present and readable.

## Encrypted files with gpg

### GPG setup

```toml
# chezmoi.toml
encryption = "gpg"

[gpg]
  recipient = "user@example.com"
  symmetric = false
```

### Add an encrypted file with gpg

```sh
chezmoi add --encrypt ~/.netrc
```

### Symmetric encryption (no key pair required)

```toml
[gpg]
  symmetric = true
```

chezmoi prompts for a passphrase on add and apply.

## Source state naming for encrypted files

Encrypted files in the source dir are named with the `encrypted_` prefix:

- `encrypted_dot_netrc.age` → `~/.netrc`
- `private_dot_ssh/encrypted_private_id_ed25519.age` → `~/.ssh/id_ed25519`

The `.age` or `.asc` extension is stripped at apply time.

## Secret templates in config

You can use password manager functions directly in `chezmoi.toml.tmpl`:

```toml
[data]
  gitSigningKey = {{ onepasswordRead "op://vault/GPG Key/public key" | quote }}
```

## Best practices

- Store the age identity or gpg private key outside the source repository
- Rotate secrets in the password manager, not in chezmoi templates
