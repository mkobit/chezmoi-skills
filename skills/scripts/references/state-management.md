# Script state management

Chezmoi tracks the execution of `run_once_` and `run_onchange_` scripts in a persistent state database.

## State Subcommands

You can interact with the persistent state using the `chezmoi state` command. The subcommands include:

- `dump`: Generate a dump of the persistent state.
- `delete`: Delete a specific value from the persistent state.
- `delete-bucket`: Delete an entire bucket from the persistent state.
- `get-bucket`: Get a bucket from the persistent state.
- `list-buckets`: List all buckets in the persistent state.
- `get`: Get a value from the persistent state.
- `reset`: Reset the persistent state.
- `set`: Set a value from the persistent state.
- `data`: Print the raw data in the persistent state.

## Bucket Names

Chezmoi uses specific "buckets" within its state database to track script executions:

- `scriptState`: Tracks the execution of `run_once_` scripts.
- `entryState`: Tracks the execution and hashes of `run_onchange_` scripts.

## Inspecting Script State

You can inspect which `run_once_` scripts have run and view their stored hashes by running:

```sh
chezmoi state dump
```

Alternatively, to retrieve only the `run_once_` state, use:

```sh
chezmoi state get-bucket --bucket=scriptState
```

## State Database Path

The state database file (`chezmoistate.boltdb`) is stored locally on each machine. Its default location varies by operating system:

- **Linux:** `~/.config/chezmoi/chezmoistate.boltdb`
- **macOS:** `~/Library/Application Support/chezmoi/chezmoistate.boltdb`
- **Windows:** `~/AppData/Roaming/chezmoi/chezmoistate.boltdb`

The location can also be manually specified or overridden using the `--persistent-state` CLI option or the `persistentState` configuration file setting.
