import * as vscode from 'vscode';
import { ExtensionState, startSession } from "../bios/extension-state";
import { getFeatures, haskellSymbolRegex, strToLocation, haskellSelector } from '../utils';

export function registerReference(ext: ExtensionState) {
    async function provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken):
        Promise<undefined | vscode.Location[]> {
        if (! getFeatures(document.uri).reference)
            // Reference disabled by user
            return;

        const session = await startSession(ext, document);
        if (session === null) return;

        const range = document.getWordRangeAtPosition(position, haskellSymbolRegex);

        await session.loading;

        await session.loadInterpreted(document.uri);

        const cmd = `:uses ${JSON.stringify(document.uri.fsPath)}`
            + ` ${1 + + range.start.line} ${1 + + range.start.character}`
            + ` ${1 + + range.end.line} ${1 + + range.end.character}`
            + ` ${document.getText(range)}`;

        const res = (await session.ghci.sendCommand(cmd, { token })).filter(s => s.trim().length > 0);

        const workspacePath = vscode.workspace.getWorkspaceFolder(document.uri).uri.fsPath;
        const seen: Set<string> = new Set();
        const locs: vscode.Location[] = [];

        for (const line of res) {
            if (seen.has(line)) continue;
            seen.add(line);
            const loc = strToLocation(line, workspacePath);
            if (loc !== null) locs.push(loc);
        }

        return locs.length ? locs : undefined;
    }

    ext.context.subscriptions.push(
        vscode.languages.registerReferenceProvider(
            haskellSelector,
            { provideReferences })
    )
}
