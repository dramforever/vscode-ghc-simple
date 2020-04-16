import * as vscode from 'vscode';
import { ExtensionState, startSession } from './extension-state';
import { haskellSymbolRegex, haskellSelector, getFeatures } from './utils';
import { Hover, MarkdownString } from 'vscode';

export function registerDocumentation(ext: ExtensionState) {
    async function provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken):
        Promise<null | Hover> {
        if (! getFeatures(document.uri).documentation)
            // Documentation disabled by user
            return null;

        const range = document.getWordRangeAtPosition(position, haskellSymbolRegex);
        if(! range)
            return null;

        const session = await startSession(ext, document);
        await session.loading;

        await session.ghci.sendCommand(
            `:module *${session.getModuleName(document.uri.fsPath)}`,
            { token });

        const cmd = `:doc ${document.getText(range)}`;
        const response = await session.ghci.sendCommand(cmd, { token });

        const haddock = response
            .join("\n")
            .replace(/^ /gm, "")
            .replace(/^$/gm, "  ");
            
        // Convert Haddock markup into Markdown so it can be displayed properly in hover
        const markdown = haddock
            // Header: ===
            .replace(/^(=+)/gm, (_, $1) => $1.replace(/=/g, "#"))
            // Emphasis: /.../
            .replace(/(?<!\\)\/(.+?)(?<!\\)\//g, "_$1_")
            // Hyperlinked definition: 'T'
            .replace(/(?<!\\)'(\S+)'(?<!\\)/gm, "`$1`")
            // Module: "Prelude"
            .replace(/(?<!\\)"(\S+)"(?<!\\)/gm, "`$1`")
            // Example:
            // >>> fib 10
            // 55
            .replace(/^>>> .+$\n^.+/gm, m => m.replace(/^.+$/gm, "> $&"))   
            // Definition list:
            // [Element]
            //    Definition
            .replace(/^\s*\[(.+?)\]:?\s*([\s\S]+?)(?=\s*^\S)/gm, "$1  \n&nbsp;&nbsp;&nbsp;&nbsp;$2  ")
            // Inline code block: @...@
            .replace(/@(.+?)@/gm, (_, $1) => `\`${$1.replace(/`(.+?)`/gm, "$1")}\``)
            .replace(/^ *(?=`)/gm, m => m.replace(/ /g, "&nbsp;"))
            // Code block:
            // @
            // ...
            // @
            .replace(/^@\n([\s\S]+?)^@/gm, (_, $1) => `\`\`\`haskell\n${$1.replace(/`(.+?)`/gm, "$1")}\`\`\`\n`)
            // Code block:
            // >
            // >
            .replace(/(?:^>(?!>).*\n?)+/gm, m => `\`\`\`haskell\n${m.replace(/^> ?(.*\n?)/gm, "$1")}\`\`\`\n`);

        if(! markdown.match(/<interactive>[\d\s:-]+error/)) {
            return new Hover(new MarkdownString(markdown), range);
        } else {
            return null;
        }
    }

    ext.context.subscriptions.push(
        vscode.languages.registerHoverProvider(
            haskellSelector,
            { provideHover }));
}
