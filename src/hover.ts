import * as vscode from 'vscode';
import { ExtensionState, startSession } from './extension-state';
import { haskellSymbolRegex, haskellSelector, getFeatures, getIdentifierDocs } from './utils';
import { Hover, MarkdownString } from 'vscode';

export function registerHover(ext: ExtensionState) {
    async function provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken) {
        if (! getFeatures(document.uri).hover)
            // Hover disabled by user
            return null;

        const range = document.getWordRangeAtPosition(position, haskellSymbolRegex);

        if (! range) return null;

        const session = await startSession(ext, document);
        await session.loading;
        const documentation = await getIdentifierDocs(
            session, document.uri, document.getText(range)
        );
        return new Hover(new MarkdownString(documentation), range);
    }

    ext.context.subscriptions.push(
        vscode.languages.registerHoverProvider(
            haskellSelector,
            { provideHover }));
}
