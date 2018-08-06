# Change Log

## v0.0.9

- Add configuration options.
- Other minor fixes.

## v0.0.8

- Support cancellation of not yet started commands.
- Fix type query after reload
- Other minor fixes enhancements.

## v0.0.7

- Use only one GHCi instance per workspace for `stack` and `cabal` workspaces.
- Check all Haskell files on extension startup.

## v0.0.6

- Added 'go to definition' support.
- Other minor enhancements.

## v0.0.5

- Improvements to `stack` workspaces, including:
    - Loading all targets with `stack repl` so tests and benchmarks code will work
    - Using `--no-load` to improve GHCi startup time.
- Some internal code cleanup.

## v0.0.4

- Show `:info` for completion items
- Type query hides when you type
- Type query is also shown on hover; intended to be used for long types

## v0.0.3

- Fixed a few problems with type query prettifying

## v0.0.2

First significant release, with features:

- Diagnostics
- Completion
- Type query