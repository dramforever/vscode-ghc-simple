# Simple GHC (Haskell) Integration for VSCode

<div align="center">
    <p><img src="images/vgs-icon.png" alt="Icon">
    <p><em>Simple Haskell support using only GHCi.</em>
</div>

(Icon derived from logo on <http://haskell.org/>.)

## Shiny badges

[![vscode-ghc-simple on Visual Studio Marketplace](https://img.shields.io/vscode-marketplace/v/dramforever.vscode-ghc-simple.svg)](https://marketplace.visualstudio.com/items?itemName=dramforever.vscode-ghc-simple) [![CI](https://img.shields.io/github/workflow/status/dramforever/vscode-ghc-simple/CI.svg)](https://github.com/dramforever/vscode-ghc-simple/actions?query=workflow%3ACI)

## Related and recommended extensions

- [Haskutil](https://github.com/EduardSergeev/vscode-haskutil) provides Quick Fix actions for tasks like missing/redundant imports that GHC reports. It works with this extension by reading the diagnostics it produces.


## Installation

Get vscode-ghc-simple from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=dramforever.vscode-ghc-simple) or run the following in Quick Open:

```plain
ext install dramforever.vscode-ghc-simple
```

Alternatively, if you want the latest and greatest, you can download `vsix` files from [GitHub Actions](https://github.com/dramforever/vscode-ghc-simple/actions?query=workflow%3ACI). Pick the latest build, and check out the 'Artifacts' section.

## What?

This VSCode extension provides editing enhancements for  Haskell development.

Currently implemented features:

1. **Diagnostics:** Basic squiggles and error messages. Automatic re-checking on save.

    ![Squiggle demo screenshot](https://github.com/dramforever/dram.cf/raw/master/repo/vscode-ghc-simple/squiggle.png)

2. **Completion:** Crude completion with GHCi's `:complete` command, with `:info` and `:doc` lookup. Works okay with imported and top level identifiers.

    ![Completion demo screenshot](https://github.com/dramforever/dram.cf/raw/master/repo/vscode-ghc-simple/completion-doc.png)

3. **Hover:** Hover to see `:info` and `:doc` lookup.

    ![Completion demo screenshot](https://github.com/dramforever/dram.cf/raw/master/repo/vscode-ghc-simple/hover-doc.png)

4. **Type:** View types by selecting in the code. The minimal expression covering the selection will have its type shown. Implemented with `:all-types`.

    ![Range type demo screenshot](https://github.com/dramforever/dram.cf/raw/master/repo/vscode-ghc-simple/range-type.png)

5. **Inline REPL:** Add REPL blocks to your code with haddock syntax, either using no spaces before `>>>` or put it in a comment like `-- >>>`. Click on the code lens or type `Shift+Enter` to run a single block, or type `Shift+Alt+Enter` to run all blocks in a file.

    ![Inline REPL demo screenshot](https://github.com/dramforever/dram.cf/raw/master/repo/vscode-ghc-simple/inline-repl.png)

    If the first line of a block begins with `:set`, it also applies to loading dependency modules. One use is to override `-fbyte-code` or `-fobject-code` settings.


6. **Definition and usages:** See definitions amd references of identifiers. Supports both module level and local identifiers. Implemented with `:loc-at` and `uses`. Does not yet support identifiers imported from packages.

    ![Definition demo screenshot](https://github.com/dramforever/dram.cf/raw/master/repo/vscode-ghc-simple/definition.png)


## Why?

Since around GHC 8, the compiler GHC and its interactive REPL GHCi has gained various tooling-related features. These allow for more tooling that communicate with the compiler using text IO and files, instead of a Haskell API. This project aims to explore the possibilities provided by said features, by implementing Haskell tooling within the editor VSCode.

## Basic usage

Install the extension from the marketplace or using the Quick Open command `ext install dramforever.vscode-ghc-simple`. Open individual Haskell source files or projects, and vscode-ghc-simple will try to use the appropriate way to start a GHCi session and communicate with it to provide editor tooling.

Use an `hie.yaml` or the extension configuration to tweak vscode-ghc-simple's behavior. Check out the wiki page [Project Configuration] for more.

[Project Configuration]: https://github.com/dramforever/vscode-ghc-simple/wiki/Project-Configuration

## Checking the logs

The full log of interaction between GHCi and this extension can be found by clicking the 'GHC' item on the status bar:

![Status bar item 'GHC'](https://github.com/dramforever/vscode-ghc-simple/raw/master/images/status-bar-ghc.png)

When reporting an issue please also attach relevant log output, ideally (but not necessarily) from a fresh start (`Developer: Reload Window` command) to reproduction of the bug. You can also check there when things go unexpectedly.

## Wiki

For the FAQ and more on configuring your project, configuring the extension, etc., please check out the [wiki page] on GitHub.

[wiki page]: https://github.com/dramforever/vscode-ghc-simple/wiki
