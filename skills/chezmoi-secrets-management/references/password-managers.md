# Password manager functions

chezmoi provides template functions to retrieve secrets dynamically from primary password managers at apply time.

## 1Password

1Password integration uses the official `op` CLI to retrieve secrets, item fields, and documents.

| Function | Signature | Output format |
| --- | --- | --- |
| `onepasswordRead` | `onepasswordRead url [account]` | String |
| `onepassword` | `onepassword uuid [vault [account]]` | Map object |
| `onepasswordDetailsFields` | `onepasswordDetailsFields uuid [vault [account]]` | Map object |
| `onepasswordDocument` | `onepasswordDocument uuid [vault [account]]` | Raw string |

```gotmpl
{{ onepasswordRead "op://vault/item/field" }}
{{ (onepassword "$UUID").fields }}
{{ (onepasswordDetailsFields "$UUID").password.value }}
{{- onepasswordDocument "$UUID" -}}
```

`onepasswordRead` accepts Secret Reference URIs in the format `op://vault/item/field` or `op://vault/item/section/field`.
`onepassword` returns structured data from `op item get --format=json`.
`onepasswordDetailsFields` maps fields by label name for simplified lookup.
If `op` is locked, chezmoi prompts interactively to sign in unless `op` desktop app integration is active.

## Bitwarden

Bitwarden integration uses the `bw` CLI to access logins, fields, and attachments.

| Function | Signature | Description |
| --- | --- | --- |
| `bitwarden` | `bitwarden "item" "$ITEMID"` | Returns parsed item JSON object |
| `bitwardenFields` | `bitwardenFields "item" "$ITEMID"` | Returns map of custom fields indexed by name |
| `bitwardenAttachment` | `bitwardenAttachment "$FILENAME" "$ITEMID"` | Returns raw attachment content as string |

```gotmpl
{{ (bitwarden "item" "$ITEMID").login.password }}
{{ (bitwardenFields "item" "$ITEMID").token.value }}
{{- bitwardenAttachment "$FILENAME" "$ITEMID" -}}
```

### Bitwarden session management

chezmoi requires a valid `BW_SESSION` environment variable or automated unlock configuration in `.chezmoi.toml`.

```toml
[bitwarden]
    unlock = "auto"
```

Setting `unlock = "auto"` causes chezmoi to invoke `bw unlock --raw` automatically when a Bitwarden session is inactive.

## HashiCorp Vault

HashiCorp Vault integration fetches secret keys via `vault kv get` or Vault API endpoints.

| Function | Signature | Description |
| --- | --- | --- |
| `vault` | `vault "$KEY"` | Parses `vault kv get -format=json $KEY` output |

```gotmpl
{{ (vault "secret/data/myapp").data.data.password }}
```

### Vault configuration and environment variables

Specify the Vault server address and authentication token in `.chezmoi.toml` or environment variables:

```toml
[vault]
    address = "https://vault.example.com:8200"
```

Environment variables `VAULT_ADDR` and `VAULT_TOKEN` override `.chezmoi.toml` settings.

## KeePassXC

KeePassXC integration retrieves passwords, entry attributes, and file attachments from `.kdbx` databases using `keepassxc-cli`.

| Function | Signature | Description |
| --- | --- | --- |
| `keepassxc` | `keepassxc "Entry Name"` | Returns entry object with `.UserName`, `.Password`, and `.URL` |
| `keepassxcAttribute` | `keepassxcAttribute "Entry Name" "attribute"` | Returns specific attribute string |
| `keepassxcAttachment` | `keepassxcAttachment "Entry Name" "filename"` | Returns raw attachment content |

```gotmpl
{{ (keepassxc "Entry Name").Password }}
{{ keepassxcAttribute "Entry Name" "attribute" }}
{{- keepassxcAttachment "Entry Name" "filename" -}}
```

### KeePassXC database configuration

Configure the database file path in `.chezmoi.toml`:

```toml
[keepassxc]
    database = "/path/to/passwords.kdbx"
```

## Upstream documentation links

- [1Password functions](https://www.chezmoi.io/reference/templates/1password-functions/): Template functions for fetching secrets, documents, and item details from 1Password.
- [Bitwarden functions](https://www.chezmoi.io/reference/templates/bitwarden-functions/): Template functions for accessing secrets, fields, and attachments from Bitwarden.
- [KeePassXC functions](https://www.chezmoi.io/reference/templates/keepassxc-functions/): Template functions for retrieving attributes and attachments from KeePassXC.
- [Vault functions](https://www.chezmoi.io/reference/templates/vault-functions/vault/): Template function for fetching secrets from HashiCorp Vault.
