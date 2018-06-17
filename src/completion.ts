import * as vscode from 'vscode';
import { DocumentManager } from "./document";

export class HaskellCompletion implements vscode.CompletionItemProvider {
    constructor(public docManagers: Map<vscode.TextDocument, DocumentManager>) {

    }

    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken):
        Promise<null | vscode.CompletionList> {
        if (this.docManagers.has(document)) {
            const mgr = this.docManagers.get(document) as DocumentManager;
            const firstInLine = position.with({ character: 0 });
            const line = document.getText(new vscode.Range(firstInLine, position));
            if (line.trim() !== '') {
                await mgr.loading;
                const complStrs = await mgr.ghci.sendCommand(`:complete repl 10 ${JSON.stringify(line)}`);
                const firstLine = /^\d+ \d+ (".*")$/.exec(complStrs[0]);
                if (firstLine !== null) {
                    complStrs.shift(); // Remove first info line
                    complStrs.pop(); // Remove last empty line
                    const result = firstLine[1];
                    const prefix = JSON.parse(result);
                    const replaceRange = new vscode.Range(position.with({ character: prefix.length }), position);
                    const items: vscode.CompletionItem[] = complStrs.map(u => {
                        const st = JSON.parse(u);
                        const cp = new vscode.CompletionItem(st, vscode.CompletionItemKind.Variable);
                        cp.range = replaceRange;
                        return cp;
                    });
                    return new vscode.CompletionList(items, true);
                } else {
                    console.log('Bad completion response');
                    return null;
                }
            } else {
                return null;
            }
        } else {
            return null;
        }
    }
}

export function registerCompletion(
    context: vscode.ExtensionContext,
    docManagers: Map<vscode.TextDocument, DocumentManager>) {
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider(
        { language: 'haskell', scheme: 'file'} , new HaskellCompletion(docManagers), ' '));
}