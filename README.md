# Simple GHC (Haskell) Integration for VSCode

![Icon](images/vgs-icon.png)

*Simple Haskell support using only GHCi.*

[![vscode-ghc-simple on Visual Studio Marketplace](https://img.shields.io/vscode-marketplace/v/dramforever.vscode-ghc-simple.svg)](https://marketplace.visualstudio.com/items?itemName=dramforever.vscode-ghc-simple) [![CircleCI](https://circleci.com/gh/dramforever/vscode-ghc-simple.png?style=shield)](https://circleci.com/gh/dramforever/vscode-ghc-simple)

## Installation

Get vscode-ghc-simple from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=dramforever.vscode-ghc-simple) or run the following in Quick Open:

```plain
ext install dramforever.vscode-ghc-simple
```

Alternatively, if you want the latest and greatest, you can download `vsix` files from [Circle CI](https://circleci.com/gh/dramforever/vscode-ghc-simple). Pick the latest build, and check out the 'Artifacts' tab.

## What?

This VSCode extension provides editing enhancements for  Haskell development.

Currently implemented features:

1. **Diagnostics:** Basic squiggles and error messages. Automatic re-checking on save.

    ![Squiggle demo screenshot](https://github.com/dramforever/dram.cf/raw/master/repo/vscode-ghc-simple/squiggle.png)

2. **Completion:** Crude completion with GHCi's `:complete` command, with `:info` lookup. Works okay with imported and top level identifiers.

    ![Completion demo screenshot](https://github.com/dramforever/dram.cf/raw/master/repo/vscode-ghc-simple/completion-info.PNG)

3. **Type:** View types by selecting in the code. The minimal expression covering the selection will have its type shown. Implemented with `:all-types`.

    ![Range type demo screenshot](https://github.com/dramforever/dram.cf/raw/master/repo/vscode-ghc-simple/range-type.png)

4. **Inline REPL:** Add REPL blocks to your code with haddock syntax, either using no spaces before `>>>` or put it in a comment like `-- >>>`. Click on the code lens or type `Shift+Enter` to run a single block, or type `Shift+Alt+Enter` to run all blocks in a file.

    ![Inline REPL demo screenshot](https://github.com/dramforever/dram.cf/raw/master/repo/vscode-ghc-simple/inline-repl.png)


5. **Definition and usages:** See definitions amd references of identifiers. Supports both module level and local identifiers. Implemented with `:loc-at` and `uses`. Does not yet support identifiers imported from packages.

    ![Definition demo screenshot](https://github.com/dramforever/dram.cf/raw/master/repo/vscode-ghc-simple/definition.png)


## Why?

Since around GHC 8, the compiler GHC and its interactive REPL GHCi has gained various tooling-related features. These allow for more tooling that communicate with the compiler using text IO and files, instead of a Haskell API. This project aims to explore the possibilities provided by said features, by implementing Haskell tooling within the editor VSCode.

## Usage

### Basic usage

Install the extension from the marketplace or using the Quick Open command `ext install dramforever.vscode-ghc-simple`. Open individual Haskell source files or projects, and vscode-ghc-simple will auto-detect the appropriate way to start a GHCi and communicate with it to provide editor tooling. Configuration options can be used to tweak the (see below).

Please note that projects should be opened so that the top-level configuration file (`stack.yaml` or `*.cabal`) is at the workspace root. This way the extension can detect the project.

Also note that when the project configuration is changed, the `Restart GHCi sessions` command needs to be issued manually for changes to take place. Again, see below.

### Debugging/issues

The full log of interaction between GHCi and this extension can be found in *Output* tab for *GHC* as shown below:

![VSCode GHC Output-tab](images/vs-code-output-tab-ghc.png)

When reporting an issue please also attach relevant log output, ideally (but not necessarily) from a fresh start (`Developer: Reload Window` command) to reproduction of the bug. You can also check there when things go unexpectedly to see.

### Commands

- `vscode-ghc-simple.restart`: Restart GHCi sessions

    vscode-ghc-simple currently lacks a way of detecting changes of critical configuration files such as `stack.yaml` or `*.cabal`. Run this command whenever, had you been running GHCi manually, you would restart it.

### Configuration options

- `ghcSimple.feature.*`: Feature switches

    Some users might want only a subset of the features provided in vscode-ghc-simple. These options can be used to disabled unneeded features.

- `ghcSimple.workspaceType`: *This option is deprecated.* See `ghcSimple.replCommand` and `ghcSimple.replScope`.

- `ghcSimple.replCommand`: The command used to start GHCi.

    Configure this to change the command used to start GHCi. `$stack_ide_targets` will be replaced by the output of `stack ide targets`. Leave blank for auto detection. When set, overrides the deprecated `ghcSimple.workspaceType`. If you set this, please also set `ghcSimple.replScope` to an appropriate value.

- `ghcSimple.replScope`: The scope of each GHCi session

    Whether GHCi should be started for a project or individual files. **Note**: This option has no effect when `ghcSimple.replCommand` is set to empty string for auto detection.

- `ghcSimple.startupCommands.*`: GHCi Startup commands

    Commands to run at GHCi startup. Configures some common options.

    Two of the command lists are semantically meant to configure GHCi for use by vscode-ghc-simple:

    - `all`: Commands for all workspaces
    - `bare`: Commands for standalone files (bare workspaces)

    If you need to add more commands, it's suggested that you do so using the following command list, so that the previous to can be updated as needed in newer versions of vscode-ghc-simple:

    - `custom`: Custom commands for all workspaces

    Change the options in workspace settings instead of user settings if you want to apply the settings to a workspace locally.

- `ghcSimple.useObjectCode`: Speed up GHCi reloads using `-fobject-code`

    Enabled by default. Load everything with `-fobject-code` first before loading needed files with `-fbyte-code`. This way only changed files need to be recompiled, which greatly speeds up GHCi on large projects.

- `ghcSimple.maxCompletions`: Maximum number of completion items to show.

- `ghcSimple.inlineRepl.codeLens`: Show code lens for GHCi REPL blocks

    Disable this if you don't like 'Run in GHCi' code lens littered around your files. If you disable the inline repl feature using `ghcSimple.feature.inlineRepl` you will also not see code lens.
