# Script state management

Reference: <https://www.chezmoi.io/reference/commands/state/>
chezmoi tracks the execution of `run_once_` and `run_onchange_` scripts in a persistent state database.

## State subcommands

Interact with the persistent state using `chezmoi state`:

| Subcommand | Purpose |
| --- | --- |
| `data` | Print the raw data in the persistent state |
| `delete` | Delete a value (`--bucket=$BUCKET --key=$KEY`) |
| `delete-bucket` | Delete an entire bucket (`--bucket=$BUCKET`) |
| `dump` | Generate a dump of the persistent state |
| `get` | Get a value (`--bucket=$BUCKET --key=$KEY`) |
| `get-bucket` | Get a bucket (`--bucket=$BUCKET`) |
| `list-buckets` | List all buckets |
| `reset` | Reset the persistent state |
| `set` | Set a value (`--bucket=$BUCKET --key=$KEY --value=$VALUE`) |

## Bucket names

- `scriptState`: tracks the execution of `run_once_` scripts.
- `entryState`: tracks the execution and hashes of `run_onchange_` scripts.

## Inspecting script state

Dump the full persistent state:

```sh
chezmoi state dump
```

Retrieve only the `run_once_` state:

```sh
chezmoi state get-bucket --bucket=scriptState
```

## State database path

chezmoi stores its persistent state in `chezmoistate.boltdb` in the same directory as its config file (default `~/.config/chezmoi/chezmoistate.boltdb`).
Override the location with the `--persistent-state` global flag or the `persistentState` configuration option.
