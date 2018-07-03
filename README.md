# Simple GHC (Haskell) Integration for VSCode

*Simple Haskell support using only GHCi.*

[![vscode-ghc-simple on Visual Studio Marketplace](https://img.shields.io/vscode-marketplace/v/dramforever.vscode-ghc-simple.svg)](https://marketplace.visualstudio.com/items?itemName=dramforever.vscode-ghc-simple)

**Notice:** This project is currently **experimental**. It's intended for testing purposes only for the time being. Things probably won't work for you. Check the issues page for some known problems.

## What?

This VSCode extension provides editing enhancements for  Haskell development.

Currently implemented features:

1. **Diagnostics:** Basic squiggles and error messages. Automatic re-checking on save.

    ![Squiggle demo screenshot](https://github.com/dramforever/dram.cf/raw/master/repo/vscode-ghc-simple/squiggle.png)

2. **Completion:** Crude completion with GHCi's `:complete` command, with `:info` lookup. Works okay with imported and top level identifiers.

    ![Completion demo screenshot](https://github.com/dramforever/dram.cf/raw/master/repo/vscode-ghc-simple/completion-info.PNG)

3. **Type:** View types by selecting in the code. The minimal expression covering the selection will have its type shown. Implemented with `:all-types`.

    ![Range type demo screenshot](https://github.com/dramforever/dram.cf/raw/master/repo/vscode-ghc-simple/range-type.png)

4. **Definition:** See definitions of identifiers. Supports both module level and local identifiers. Implemented with `:loc-at`. Does not yet support identifiers imported from packages.

    ![Definition demo screenshot](https://github.com/dramforever/dram.cf/raw/master/repo/vscode-ghc-simple/definition.png)


## Why?


Since around GHC 8, the compiler GHC and its interactive REPL GHCi has gained various tooling-related features. These allow for more tooling that communicate with the compiler using text IO and files, instead of a Haskell API. This project aims to explore the possibilities provided by said features, by implementing Haskell tooling within the editor VSCode.