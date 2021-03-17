import * as path from 'path';
import * as vscode from 'vscode';
import { ExtensionState, startSession } from '../bios/extension-state';
import { strToLocation, haskellSymbolRegex, getFeatures, haskellSelector } from '../utils';

export function registerDefinition(ext: ExtensionState) {
    async function provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken):
        Promise<null | vscode.Definition> {
        if (! getFeatures(document.uri).definition)
            // Definition disabled by user
            return null;

        const session = await startSession(ext, document);
        if (session === null) return null;

        //             ------------------------ maybe qualified
        //                                      ------------------------ operator
        //                                                               ----------------------- name

        const range = document.getWordRangeAtPosition(position, haskellSymbolRegex);

        await session.loading;

        await session.loadInterpreted(document.uri, token);

        const cmd = `:loc-at ${JSON.stringify(document.uri.fsPath)}`
            + ` ${1 + + range.start.line} ${1 + + range.start.character}`
            + ` ${1 + + range.end.line} ${1 + + range.end.character}`
            + ` ${document.getText(range)}`;

        const res = (await session.ghci.sendCommand(cmd, { token })).filter(s => s.trim().length > 0);

        if (res.length == 1) {
            const loc = res[0];
            const basePath = session.basePath || vscode.workspace.getWorkspaceFolder(document.uri).uri.fsPath
            return strToLocation(loc, basePath)
        } else {
            return null;
        }
    }

    ext.context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(
            haskellSelector,
            { provideDefinition }));
}
