import * as path from 'path';
import * as vscode from 'vscode';
import { ExtensionState, startSession } from './extension-state';

export class HaskellDefinition implements vscode.DefinitionProvider {
    constructor(public ext: ExtensionState) {
    }

    async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken):
        Promise<vscode.Definition> {
        const session = await startSession(this.ext, document);

        const range = document.getWordRangeAtPosition(position);

        await session.loading;

        const cmd = `:loc-at ${document.uri.fsPath} ${1 + + range.start.line} ${1 + + range.start.character} ${1 + + range.end.line} ${1 + + range.end.character} ${document.getText(range)}`;

        const res = (await session.ghci.sendCommand(cmd)).filter(s => s.trim().length > 0);

        if (res.length == 1) {
            const locR = /^(.+):\((\d+),(\d+)\)-\((\d+),(\d+)\)$/;
            const loc = res[0];
            const ma = loc.match(locR);
            if (ma) {
                const [_all, file, startLine, startCol, endLine, endCol] = ma
                return new vscode.Location(
                    vscode.Uri.file(path.resolve(vscode.workspace.rootPath, file)),
                    new vscode.Range(
                        new vscode.Position(+ startLine - 1, + startCol - 1),
                        new vscode.Position(+ endLine - 1, + endCol - 1)));
            } else {
                return null;
            }
        } else {
            return null;
        }
    }
}

export function registerDefinition(ext: ExtensionState) {
    ext.context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(
            { language: 'haskell', scheme: 'file' },
            new HaskellDefinition(ext)));
}