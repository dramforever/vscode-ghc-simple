import * as vscode from 'vscode';
import { ExtensionState, startSession } from './extension-state';

export class HaskellCompletion implements vscode.CompletionItemProvider {
    itemDocument: WeakMap<vscode.CompletionItem, vscode.TextDocument>

    constructor(public ext: ExtensionState) {
        this.itemDocument = new WeakMap();
    }

    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken):
        Promise<null | vscode.CompletionList> {
        const session = await startSession(this.ext, document);

        const firstInLine = position.with({ character: 0 });
        let line = document.getText(new vscode.Range(firstInLine, position));
        if (line.trim() === '') return null;

        let dummy : number = 0;

        if (line.trim().startsWith(':')) {
            line = 'x' + line;
            dummy += 1;
        }

        await session.loading;
        const complStrs = await session.ghci.sendCommand(
            `:complete repl 10 ${JSON.stringify(line)}`,
            token);

        const firstLine = /^\d+ \d+ (".*")$/.exec(complStrs[0]);

        if (firstLine === null) {
            this.ext.outputChannel.appendLine('Bad completion response');
            return null;
        }

        complStrs.shift(); // Remove first info line
        complStrs.pop(); // Remove last empty line

        const result = firstLine[1];
        const prefix = JSON.parse(result);
        const replaceRange = new vscode.Range(position.with({ character: prefix.length - dummy }), position);
        const items: vscode.CompletionItem[] = complStrs.map(u => {
            const st = JSON.parse(u);
            const cp = new vscode.CompletionItem(st, vscode.CompletionItemKind.Variable);
            cp.range = replaceRange;
            this.itemDocument.set(cp, document);
            return cp;
        });

        return new vscode.CompletionList(items, true);
    }

    async resolveCompletionItem(
        item: vscode.CompletionItem,
        token: vscode.CancellationToken):
        Promise<vscode.CompletionItem> {
        if (this.itemDocument.has(item)) {
            const document = this.itemDocument.get(item);
            const session = await startSession(this.ext, document);
            const docs = await session.ghci.sendCommand(`:info ${item.label}`, token);

            // Heuristic: If there's an error, then GHCi will output
            // a blank line before the error message
            if (docs[0].trim() != '') {
                const fixedDocs = docs.map((s) => s.replace('\t--', '\n--').trim());
                item.detail = fixedDocs.join('\n');
            }
        }
        return item;
    }
}

export function registerCompletion(ext: ExtensionState) {
    ext.context.subscriptions.push(vscode.languages.registerCompletionItemProvider(
        { language: 'haskell', scheme: 'file' } , new HaskellCompletion(ext), ' '));
}