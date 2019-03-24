import * as vscode from 'vscode';
import { ExtensionState, startSession } from './extension-state';
import { haskellReplLine, getFeatures } from './utils';


export function registerInlineRepl(ext: ExtensionState) {
    const availableRepl: WeakMap<vscode.TextDocument, [vscode.Range, vscode.Command][]> = new WeakMap();

    async function inlineReplRun (
        textEditor: vscode.TextEditor,
        edit: vscode.TextEditorEdit,
        arg?: {
            range: vscode.Range,
            commands: string[],
            prefix: string,
            hasRan: { flag: boolean },
            batch?: boolean
        }): Promise<void> {
        if (typeof arg === 'undefined') {
            if (! availableRepl.has(textEditor.document)) return;
            for (const [ hr, cmd ] of availableRepl.get(textEditor.document))
                if (hr.contains(textEditor.selection) && cmd.arguments[0]) {
                    await inlineReplRun(textEditor, edit, cmd.arguments[0]);
                    break;
                }
        } else {
            const { range, commands, prefix, hasRan } = arg;
            if (hasRan.flag) return;
            hasRan.flag = true;

            const session = await startSession(ext, textEditor.document);
            await session.loading;
            await session.ghci.sendCommand(
                `:module *${session.getModuleName(textEditor.document.uri.fsPath)}`);
            const response = await session.ghci.sendCommand(commands);
            if (response[0] == '') response.shift();
            if (response[response.length - 1] == '') response.pop();
            const filtRsponse = response.map(s => prefix + (s == '' ? '<BLANKLINE>' : s));
            const end = range.isEmpty ? '\n' : '';
            const replacement = filtRsponse.join('\n') + '\n' + prefix.replace(/\s+$/, '') + end;
            await textEditor.edit(e => e.replace(range, replacement),
                { undoStopBefore: ! arg.batch, undoStopAfter: ! arg.batch });
        }
    }

    async function inlineReplRunAll(
        textEditor: vscode.TextEditor,
        edit: vscode.TextEditorEdit):
        Promise<void> {
        if (! availableRepl.has(textEditor.document)) return;
        textEditor.edit(() => {}, { undoStopBefore: true, undoStopAfter: false });
        for (const [ hr, cmd ] of availableRepl.get(textEditor.document))
        await inlineReplRun(textEditor, edit, Object.assign({}, cmd.arguments[0], { batch: true }));
        textEditor.edit(() => {}, { undoStopBefore: false, undoStopAfter: true });
    }

    ext.context.subscriptions.push(
        vscode.commands.registerTextEditorCommand('vscode-ghc-simple.inline-repl-run', inlineReplRun),
        vscode.commands.registerTextEditorCommand('vscode-ghc-simple.inline-repl-run-all', inlineReplRunAll)
    );

    async function provideCodeLenses(
        document: vscode.TextDocument):
        Promise<vscode.CodeLens[]> {
        if (! getFeatures(document.uri).inlineRepl) {
            // Inline REPL disabled by user
            availableRepl.delete(document);
            return;
        }

        const codeLensEnabled: boolean =
            vscode.workspace.getConfiguration(
                'ghcSimple.inlineRepl', document.uri).codeLens;
        const codeLenses: vscode.CodeLens[] = [];
        const available: [vscode.Range, vscode.Command][] = [];
        const lineCount = document.lineCount;
        for (let lineNum = 0; lineNum < lineCount;) {
            const headerLineNum = lineNum;
            const headerLine = document.lineAt(lineNum);
            const header = headerLine.text.replace(/\s+$/, '');
            const headerRes = haskellReplLine.exec(header);
            if (headerRes !== null) {
                const prefix = headerRes[1] || '';
                const commands = [];
                for (; lineNum < lineCount; lineNum ++) {
                    const line = document.lineAt(lineNum).text.replace(/\s+$/, '');
                    const lineRes = haskellReplLine.exec(line);
                    if (line.startsWith(prefix) && lineRes !== null) {
                        commands.push(lineRes[2])
                    } else {
                        break;
                    }
                }

                const outputLineNum = lineNum;

                for (; lineNum < lineCount; lineNum ++) {
                    const line = document.lineAt(lineNum).text.replace(/\s+$/, '');

                    if (line == prefix.replace(/\s+$/, '')) {
                        lineNum ++;
                        break;
                    }
                    if (haskellReplLine.test(line) || ! line.startsWith(prefix))
                        break;
                }

                const endLineNum = lineNum;

                const headerRange = new vscode.Range(
                    document.lineAt(headerLineNum).range.start,
                    document.lineAt(outputLineNum - 1).range.end);

                const range = new vscode.Range(
                    document.lineAt(outputLineNum).range.start,
                    outputLineNum == endLineNum
                        ? document.lineAt(outputLineNum).range.start
                        : document.lineAt(endLineNum - 1).range.end);

                const command: vscode.Command = {
                    title: 'Run in GHCi',
                    command: 'vscode-ghc-simple.inline-repl-run',
                    arguments: [
                        {
                            range, commands, prefix,
                            hasRan: { flag: false }
                        }
                    ]
                };

                available.push([headerRange, command]);
                if (codeLensEnabled) codeLenses.push(new vscode.CodeLens(headerLine.range, command));
            } else {
                lineNum ++;
            }
        }
        availableRepl.set(document, available);
        return codeLenses;
    }

    ext.context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { language: 'haskell', scheme: 'file' },
            { provideCodeLenses }
        )
    );
}
