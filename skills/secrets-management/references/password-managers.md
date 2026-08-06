# Password manager functions

chezmoi provides template functions to retrieve secrets dynamically from various password managers and secret stores at apply time.

## 1Password

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

`onepassword` and `onepasswordDetailsFields` return structured data parsed from `op` JSON output.
Requires the `op` CLI.
chezmoi prompts to sign in if there is no valid session.

## Bitwarden

```gotmpl
{{ (bitwarden "item" "$ITEMID").login.password }}
{{ (bitwardenFields "item" "$ITEMID").token.value }}
{{- bitwardenAttachment "$FILENAME" "$ITEMID" -}}
```

`bitwarden` and `bitwardenFields` pass arguments to `bw get` unchanged and parse the JSON output.
`bitwardenFields` indexes the `fields` array by field `name`.
Requires `bw` CLI and `BW_SESSION` env var, or set `bitwarden.unlock = "auto"` in config to run `bw unlock --raw` automatically.

## pass and gopass

```gotmpl
{{ pass "path/to/secret" }}
{{ (passFields "path/to/secret").password }}
{{ gopass "path/to/secret" }}
```

`pass` and `gopass` return only the first line of output.
`passRaw` and `gopassRaw` return the full output.

## KeePassXC

```gotmpl
{{ (keepassxc "Entry Name").Password }}
{{ keepassxcAttribute "Entry Name" "attribute" }}
{{- keepassxcAttachment "Entry Name" "filename" -}}
```

Requires `keepassxc-cli` and `keepassxc.database` set in config.

## OS keyring

Retrieves passwords from macOS Keychain, GNOME Keyring, or Windows Credentials Manager.

```gotmpl
{{ keyring "service" "user" }}
```

Set values with:

```sh
chezmoi secret keyring set --service=$SERVICE --user=$USER
```

## HashiCorp Vault

```gotmpl
{{ (vault "$KEY").data.data.password }}
```

`vault` takes a single key, passes it to `vault kv get -format=json $KEY`, and returns the parsed JSON.

## Generic CLI secret tools

```toml
[secret]
    command = "vault"
```

```gotmpl
{{ secret "arg" }}
{{ secretJSON "kv" "get" "-format=json" "$ID" }}
```

`secret` returns raw command output with whitespace trimmed.
`secretJSON` parses the output as JSON.

## Additional secret providers

| Provider | Template functions / Usage |
| --- | --- |
| AWS Secrets Manager | `{{ awsSecretsManager "secret-id" }}` / `{{ awsSecretsManagerRaw "secret-id" }}` |
| Azure Key Vault | `{{ azureKeyVault "vaultName" "secretName" }}` |
| Doppler | `{{ doppler "project" "config" "secret" }}` / `{{ dopplerProjectJson "project" "config" }}` |
| Dashlane | `{{ dashlanePassword "item" }}` / `{{ dashlaneNote "item" }}` |
| ejson | `{{ ejsonDecrypt "path/to/key" "path/to/ejson" }}` |
| Keeper | `{{ keeper "record-title" }}` / `{{ keeperDataFields "record-title" }}` |
| LastPass | `{{ lastpass "name" }}` |
| Proton Pass | `{{ protonpass "item-name" }}` |

## Upstream documentation links

- [1Password functions](https://www.chezmoi.io/reference/templates/1password-functions/): Template functions for fetching secrets, documents, and item details from 1Password.
- [Bitwarden functions](https://www.chezmoi.io/reference/templates/bitwarden-functions/): Template functions for accessing secrets, fields, and attachments from Bitwarden.
- [KeePassXC functions](https://www.chezmoi.io/reference/templates/keepassxc-functions/): Template functions for retrieving attributes and attachments from KeePassXC.
- [Vault functions](https://www.chezmoi.io/reference/templates/vault-functions/vault/): Template function for fetching secrets from HashiCorp Vault.
- [pass functions](https://www.chezmoi.io/reference/templates/pass-functions/): Template functions for retrieving passwords and fields using Unix pass.
- [gopass functions](https://www.chezmoi.io/reference/templates/gopass-functions/): Template functions for the gopass password manager.
- [Keychain functions](https://www.chezmoi.io/reference/templates/keyring-functions/keyring/): Template function for retrieving passwords from OS keyrings.
- [Generic secret functions](https://www.chezmoi.io/reference/templates/secret-functions/): Generic functions for executing external commands to retrieve secrets.
