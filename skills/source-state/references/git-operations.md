# Git operations

## Edit your dotfiles

Edit a dotfile with:

```sh
chezmoi edit $FILENAME
```

This will edit `$FILENAME`'s source file in your source directory. chezmoi will not make any changes to the actual dotfile until you run `chezmoi apply`.

To automatically run `chezmoi apply` when you quit your editor, run:

```sh
chezmoi edit --apply $FILENAME
```

To automatically run `chezmoi apply` whenever you save the file in your editor, run:

```sh
chezmoi edit --watch $FILENAME
```

## Pull the latest changes from your repo and apply them

You can pull the changes from your repo and apply them in a single command:

```sh
chezmoi update
```

This runs `git pull --autostash --rebase` in your source directory and then `chezmoi apply`.

## Pull the latest changes from your repo and see what would change, without actually applying the changes

Run:

```sh
chezmoi git pull -- --autostash --rebase && chezmoi diff
```

This runs `git pull --autostash --rebase` in your source directory and `chezmoi diff` then shows the difference between the target state computed from your source directory and the actual state.

## Automatically commit and push changes to your repo

chezmoi can automatically commit and push changes to your source directory to your repo. This feature is disabled by default. To enable it, add the following to your config file:

```toml
[git]
    autoCommit = true
    autoPush = true
```

Whenever a change is made to your source directory, chezmoi will commit the changes with an automatically-generated commit message (if `autoCommit` is true) and push them to your repo (if `autoPush` is true). `autoPush` implies `autoCommit`.

You can override the commit message by setting the `git.commitMessageTemplate` configuration variable. For example, to have chezmoi prompt you for a commit message each time:

```toml
[git]
    autoCommit = true
    commitMessageTemplate = "{{ promptString \"Commit message\" }}"
```

If your commit message is longer than fits in a string then you can set `git.commitMessageTemplateFile` to specify a path to the commit message template relative to the source directory.

## Install chezmoi and your dotfiles on a new machine with a single command

If your dotfiles repo is `github.com/$GITHUB_USERNAME/dotfiles` then installing chezmoi, running `chezmoi init`, and running `chezmoi apply` can be done in a single line of shell:

```sh
sh -c "$(curl -fsLS https://get.chezmoi.io)" -- init --apply $GITHUB_USERNAME
```
