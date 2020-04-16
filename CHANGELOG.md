# Change Log

## Unreleased changes

- [#12](https://github.com/dramforever/vscode-ghc-simple/issues/12), [#59](https://github.com/dramforever/vscode-ghc-simple/pull/59), [#60](https://github.com/dramforever/vscode-ghc-simple/pull/60) `:doc` output is available in completion and hover. Thanks to [EduardSergeev](https://github.com/EduardSergeev) for the contribution.
- [#27](https://github.com/dramforever/vscode-ghc-simple/issues/27), [#36](https://github.com/dramforever/vscode-ghc-simple/issues/36) Now when loading modules `-fno-code` is always used, and just before a REPL run either `-fbyte-code` (default) or `-fobject-code` is used to load the modules (configurable per workspace and per REPL block. See README).

## v0.1.19

- Better icon. Geometrically derived from the logo on <https://haskell.org> using [Inkscape](https://inkscape.org/), instead of the old mixture of eye-measured lines and manually painted background.
- [#54](https://github.com/dramforever/vscode-ghc-simple/issues/54) Stack setup no longer uses `--stdout` with `stack ide targets`, making it compatible with older stack versions.
- [#55](https://github.com/dramforever/vscode-ghc-simple/issues/55) Status bar indicator for GHC, telling you whether it is busy and what it's doing. Click to show logs.
- Evaluation in GHCi no longer gets deferred type errors.

## v0.1.18, v0.1.17

- Nothing on the user side.
- Internal: CI is now based on GitHub Actions. VSCode Marketplace does not allow retracting versions so when errors were made, versions were wasted. Sorry for the inconvenience.

## v0.1.16

- [#41](https://github.com/dramforever/vscode-ghc-simple/issues/41) Further possible fix for 'rogue' GHCi processes consuming large amount of CPU and memory resources.
- Internal: Fix warnings about unhandled rejected promises.

## v0.1.15

- [#41](https://github.com/dramforever/vscode-ghc-simple/issues/41) Possible fix for 'rogue' GHCi processes consuming large amount of CPU and memory resources.

## v0.1.14

- ([#50](https://github.com/dramforever/vscode-ghc-simple/issues/50),[#47](https://github.com/dramforever/vscode-ghc-simple/issues/47)) Clean stack output on Windows. Workaround for some issues while reading `stack`'s output.

## v0.1.13

- Detect current ghci search for go to definition for multi-package setups. By [dimsmol](https://github.com/dimsmol) ([#42](https://github.com/dramforever/vscode-ghc-simple/pull/42))
- Filter out 'it' and 'Ghci*.it' in completion results
- Internal: Updated dependencies

## v0.1.12

- ([#40](https://github.com/dramforever/vscode-ghc-simple/issues/40)) Quick fix for a typo for working around stack color output

## v0.1.11

- New configuration option `ghcSimple.replCommand` and `ghcSimple.replScope` override the now deprecated `ghcSimple.workspaceType` and provide more control over how GHCi is started.
- Minor fixes including:
    - Avoid truncation of -Werror error messages by [rimmington](https://github.com/rimmington) ([#38](https://github.com/dramforever/vscode-ghc-simple/pull/38))
    - Workaround for stack color output on Windows by [1Computer1](https://github.com/1Computer1) ([#37](https://github.com/dramforever/vscode-ghc-simple/pull/37), [32683c2](https://github.com/dramforever/vscode-ghc-simple/commit/32683c2fe8048cc8c1c360b31a8ebe42da2c6185))

## v0.1.10

- Large projects where `:all-types` take too long to finish are given a notice. The user is prompted to disable this feature.
- Other minor fixes.

## v0.1.9

- Minor fixes

## v0.1.8

- Rudimentary support for Literate Haskell files. Basically, the extension now 'works' in `.lhs` files.
- Cleaner marking of multi-line expressions in type query.
- Other minor fixes.

## v0.1.7

- ([#27](https://github.com/dramforever/vscode-ghc-simple/issues/27)) Fix configuration handling
- ([#28](https://github.com/dramforever/vscode-ghc-simple/issues/28)) Fix handling files without workspace folder
- Fix multi-root workspace type detection

## v0.1.6

- Fix inline REPL when the user types too fast and code lenses haven't updated yet.

## v0.1.5

- Minor fixes.

## v0.1.4

- New feature: inline REPL. Run Haddock REPL comments in your file in a single click.
- Other minor enhancements and fixes.

## v0.1.3

- Minor fixes, including [#25](https://github.com/dramforever/vscode-ghc-simple/pull/25) from [edmundnoble](https://github.com/edmundnoble) and [#26](https://github.com/dramforever/vscode-ghc-simple/pull/26) from [EduardSergeev](https://github.com/EduardSergeev).

## v0.1.2

- Fix parsing of single-line warnings

## v0.1.1

- ([#7](https://github.com/dramforever/vscode-ghc-simple/issues/7)) Some flags like `-Werror=no-home-modules` or `-fhide-source-paths` break vscode-ghc-simple. This has been worked around.
- Now vscode-ghc-simple will use `-fobject-code` to speed up reloads of modules. You can disable this by changing the option `ghcSimple.useObjectCode`.
- Other minor enhancements and fixes.

## v0.1.0

- ([#24](https://github.com/dramforever/vscode-ghc-simple/pull/24), [#6](https://github.com/dramforever/vscode-ghc-simple/issues/6)) Cabal new-build and v2 support. Thanks to [edmundnoble](https://github.com/edmundnoble) for this pull request.
- Multi-root workspaces support.
- Show references support.
- Other minor enhancements and fixes, including:
    - ([#18](https://github.com/dramforever/vscode-ghc-simple/pull/18), [#13](https://github.com/dramforever/vscode-ghc-simple/issues/13)) Extension is more robust when `stack ide targets` emits warnings. Thanks to [EduardSergeev](https://github.com/EduardSergeev) for this pull request.
    - Type query now uses `:all-types` to find the range only, and uses `:type-at` to find the actual type. This replaces the unneededly complex 'type resolver'.
    - ([#14](https://github.com/dramforever/vscode-ghc-simple/pull/14)) Quote file names more carefully to handle paths with spaces.
    - ([#19](https://github.com/dramforever/vscode-ghc-simple/pull/19)) Various features of this extension can be switched off using options.

## v0.0.10

- ([#8](https://github.com/dramforever/vscode-ghc-simple/pull/8)) Added dependency on [Haskell Syntax Highlighting](https://marketplace.visualstudio.com/items?itemName=justusadam.language-haskell). Thanks to [2mol](https://github.com/2mol) for this pull request.
- Added some rudimentary documentation.

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
