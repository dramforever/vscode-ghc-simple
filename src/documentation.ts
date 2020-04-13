import * as vscode from 'vscode';
import { ExtensionState, startSession } from './extension-state';
import { haskellSymbolRegex, haskellSelector, getFeatures } from './utils';
import { Hover, MarkdownString } from 'vscode';

export function registerDocumentation(ext: ExtensionState) {
    async function provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken) {
        if (! getFeatures(document.uri).documentation)
            // Documentation disabled by user
            return null;

        const range = document.getWordRangeAtPosition(position, haskellSymbolRegex);

        const session = await startSession(ext, document);
        await session.loading;

        await session.ghci.sendCommand(
            `:module *${session.getModuleName(document.uri.fsPath)}`,
            { token });

        const cmd = `:doc ${document.getText(range)}`;
        const response = await session.ghci.sendCommand(cmd, { token });

        // Convert Haddock markup into Markdown so it can be displayed properly in hover
        const documentation = response
            .map(l => l.replace(/^$/m, "  "))
            .join("\n")
            .replace(/^\s/gm, "")
            .replace(/^(=+)/gm, (_, $1) => $1.replace(/=/g, "#"))  // Header: ===
            .replace(/@(.+?)@/gm, (_, $1) => `\`${$1.replace(/'(.+?)'/gm, "$1")}\``) // Code block: @...@
            .replace(/(?<!\\)'(\S+)'(?<!\\)/gm, "`$1`")  // Hyperlinked definition: 'T'
            .replace(/(?<!\\)"(\S+)"(?<!\\)/gm, "`$1`")  // Module: "Prelude"
            .replace(/(?<!\\)\/(.+?)(?<!\\)\//g, "_$1_") // Emphasis: /.../ 
            .replace(/(>>> .+$\n^.+)/gm, "```haskell\n$1\n```")  // Repl: >>>
            .replace(/\[(.+?)\]:\s(.+)$/gm, "$1  \n&nbsp;&nbsp;&nbsp;&nbsp;$2  ")  // Definition list: [Element]:
            .replace(/(?:^>(?!>).*\n?)+/gm, m => `\`\`\`haskell\n${m.replace(/^>(.*\n?)/gm, "$1")}\n\`\`\``) // Code block: >
        return new Hover(new MarkdownString(documentation), range);
    }

    ext.context.subscriptions.push(
        vscode.languages.registerHoverProvider(
            haskellSelector,
            { provideHover }));
}
