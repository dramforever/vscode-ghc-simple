import * as path from 'path';
import * as vscode from 'vscode';
import { ExtensionState } from './extension-state';
import { Session } from './session';

export const haskellSymbolRegex = /([A-Z][A-Za-z0-9_']*\.)*([!#$%&*+./<=>?@\^|\-~:]+|[A-Za-z_][A-Za-z0-9_']*)/;
export const haskellReplLine = /^(\s*-{2,}\s+)?>>>(.*)$/;
export const stackCommand = 'stack --no-terminal --color never';

export const haskellSelector: vscode.DocumentSelector = [
    { language: 'haskell', scheme: 'file' },
    { language: 'literate haskell', scheme: 'file' }
];

export function documentIsHaskell(doc: vscode.TextDocument) {
    return doc.uri.scheme === 'file' && (
        [ 'haskell', 'literate haskell' ].indexOf(doc.languageId) !== -1
        || [ '.hs', '.lhs' ].some(suf => doc.uri.fsPath.endsWith(suf)));
}

export function strToLocation(s: string, workspaceRoot: string): null | vscode.Location {
    const locR = /^(.+):\((\d+),(\d+)\)-\((\d+),(\d+)\)$/;
    const ma = s.match(locR);
    if (ma) {
        const [_all, file, startLine, startCol, endLine, endCol] = ma;
        return new vscode.Location(
            vscode.Uri.file(path.resolve(workspaceRoot, file)),
            new vscode.Range(
                new vscode.Position(+ startLine - 1, + startCol - 1),
                new vscode.Position(+ endLine - 1, + endCol - 1)));
    } else {
        return null;
    }
}

export function getFeatures(resource: vscode.Uri): { [k: string]: any } {
    return vscode.workspace.getConfiguration('ghcSimple', resource).feature;
}

export function reportError(ext: ExtensionState, msg: string) {
    return (err) => {
        console.error(`${msg}: ${err}`);
        ext.outputChannel.appendLine(`${msg}: ${err}`);
    }
}

export async function getIdentifierDocs(
    session: Session,
    docUri: vscode.Uri,
    ident: string,
    token?: vscode.CancellationToken
): Promise<string | null> {
    const filterInfo =
        vscode.workspace.getConfiguration('ghcSimple', docUri).filterInfo as boolean;
    // Failsafe: ident should be something reasonable
    if (ident.indexOf('\n') !== -1) return null;

    const segments: string[] = [];

    const info = await session.ghci.sendCommand(
        `:info ${ident}`, { token });

    // Heuristic: If there's an error, then GHCi will output
    // a blank line before the error message
    if (info[0].trim() != '') {
        const lines = [];
        lines.push('```haskell');
        if (filterInfo) {
            for (let i = 0; i < info.length;) {
                if (info[i].startsWith('instance ')) {
                    do { i ++; }
                    while (i < info.length && info[i].match(/^\s/));
                } else {
                    lines.push(info[i]);
                    i ++;
                }
            }

        } else {
            lines.push(...info);
        }
        lines.push('```');
        segments.push(lines.map(x => x + '\n').join(''));
    }

    await session.loadInterpreted(docUri);

    const docsLines = (await session.ghci.sendCommand(
        `:doc ${ident}`, { token }))
        .filter(x => x != '<has no documentation>');

    while (docsLines.length && docsLines[0].match(/^\s*$/)) {
        docsLines.shift();
    }

    if (docsLines.length
        && ! docsLines[0].startsWith('ghc: Can\'t find any documentation for')
        && ! /^<interactive>[\d\s:-]+error/.test(docsLines[0])) {
        const docs = docsLines.join('\n');

        // Convert Haddock markup into Markdown so it can be displayed properly in hover
        const markdown = docs
        .replace(/^ /gm, "")
        .replace(/^$/gm, "  ")

        // Non-code lines
        .replace(/^(?!\s*>)[^\n]*$/gm, (match) =>
            match
            // Header: ===
            .replace(/^(=+)/gm, (_, $1) => $1.replace(/=/g, "#"))
            // Emphasis: /.../
            .replace(/(?<!\\)\/(.+?)(?<!\\)\//g, "_$1_")
            // Hyperlinked definition: 'T'
            .replace(/(?<!\\)'(\S+)'(?<!\\)/gm, "`$1`")
            // Module: "Prelude"
            .replace(/(?<!\\)"(\S+)"(?<!\\)/gm, "`$1`")
        )

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
        segments.push(markdown);
    }

    return segments.length ? segments.join('\n---\n') : null;
}
