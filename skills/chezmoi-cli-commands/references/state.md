# Chezmoi state commands

[chezmoi state](https://www.chezmoi.io/reference/commands/state/): Manipulate the persistent state.

chezmoi records run-once script state and last-apply checksums in the state database.
This database is local to each machine and is not committed to the source repo.
Its location is `~/.local/share/chezmoi/chezmoistate.boltdb`.

## Subcommands

| Subcommand | Description |
| --- | --- |
| `data` | Print the raw data in the persistent state |
| `delete` | Delete a value from the persistent state |
| `delete-bucket` | Delete a bucket from the persistent state |
| `dump` | Generate a dump of the persistent state |
| `get` | Get a value from the persistent state |
| `get-bucket` | Get a bucket from the persistent state |
| `reset` | Reset the persistent state |
| `set` | Set a value in the persistent state |

## Examples

```sh
chezmoi state data
chezmoi state delete --bucket=$BUCKET --key=$KEY
chezmoi state delete-bucket --bucket=$BUCKET
chezmoi state dump
chezmoi state get --bucket=$BUCKET --key=$KEY
chezmoi state get-bucket --bucket=$BUCKET
chezmoi state set --bucket=$BUCKET --key=$KEY --value=$VALUE
chezmoi state reset
```
