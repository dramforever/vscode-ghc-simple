import * as vscode from 'vscode';
import { ExtensionState, startSession } from './extension-state';
import { getFeatures, haskellReplLine } from './utils';

export function registerCompletion(ext: ExtensionState) {
    const itemDocument: Map<vscode.CompletionItem, vscode.TextDocument> = new Map();

    async function provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken):
        Promise<null | vscode.CompletionList> {
        if (! getFeatures(document.uri).completion)
            // Completion disabled by user
            return null;

        const session = await startSession(ext, document);

        const firstInLine = position.with({ character: 0 });
        let line = document.getText(new vscode.Range(firstInLine, position));
        if (line.trim() === '') return null;

        let delta : number = 0;

        if (line.trim().startsWith(':')) {
            line = 'x' + line;
            delta -= 1;
        }

        const replResult = haskellReplLine.exec(line);
        if (replResult !== null) {
            line = line.slice(replResult[1].length + '>>>'.length);
            delta += replResult[1].length + '>>>'.length;
        }

        await session.loading;

        await session.ghci.sendCommand(
            `:module *${session.getModuleName(document.uri.fsPath)}`,
            token);

        const { maxCompletions } = vscode.workspace.getConfiguration('ghcSimple', document.uri);

        const complStrs = await session.ghci.sendCommand(
            `:complete repl ${maxCompletions} ${JSON.stringify(line)}`,
            token);

        const firstLine = /^\d+ \d+ (".*")$/.exec(complStrs[0]);

        if (firstLine === null) {
            ext.outputChannel.appendLine('Bad completion response');
            return null;
        }

        complStrs.shift(); // Remove first info line
        complStrs.pop(); // Remove last empty line

        const result = firstLine[1];
        const prefix = JSON.parse(result);
        const replaceRange = new vscode.Range(position.with({ character: prefix.length + delta }), position);
        const items: vscode.CompletionItem[] = complStrs.map(u => {
            const st = JSON.parse(u);
            const cp = new vscode.CompletionItem(st, vscode.CompletionItemKind.Variable);
            cp.range = replaceRange;
            itemDocument.set(cp, document);
            return cp;
        });

        return new vscode.CompletionList(items, true);
    }

    async function resolveCompletionItem(
        item: vscode.CompletionItem,
        token: vscode.CancellationToken):
        Promise<vscode.CompletionItem> {
        if (itemDocument.has(item)) {
            const document = itemDocument.get(item);
            const session = await startSession(ext, document);
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
    ext.context.subscriptions.push(vscode.languages.registerCompletionItemProvider(
        { language: 'haskell', scheme: 'file' },
        { provideCompletionItems, resolveCompletionItem },
        ' ', ':'));
}
