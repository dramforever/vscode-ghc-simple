import * as vscode from 'vscode';
import { ExtensionState, startSession } from './extension-state';
import { haskellReplLine, getFeatures } from './utils';


export function registerInlineRepl(ext: ExtensionState) {
    const availableRepl: WeakMap<vscode.TextDocument, [vscode.Range, vscode.Command][]> = new WeakMap();

    function parseReplBlockAt(
        document: vscode.TextDocument, lineNum: number):
        [number, null | {
            headerRange: vscode.Range,
            outputRange: vscode.Range,
            commands: string[],
            prefix: string
        }] {
        const { lineCount } = document;
        const headerLine = document.lineAt(lineNum);
        const header = headerLine.text.replace(/\s+$/, '');
        const headerRes = haskellReplLine.exec(header);
        if (headerRes !== null) {
            const headerLineNum = lineNum;
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

            const outputRange = new vscode.Range(
                document.lineAt(outputLineNum).range.start,
                outputLineNum == endLineNum
                    ? document.lineAt(outputLineNum).range.start
                    : document.lineAt(endLineNum - 1).range.end);

            return [ lineNum, { headerRange, outputRange, commands, prefix } ];
        } else {
            return [ lineNum + 1, null ];
        }
    }

    async function inlineReplRun (
        textEditor: vscode.TextEditor,
        edit: vscode.TextEditorEdit,
        arg?: {
            headerLineNum: number
            isRunning: { flag: boolean },
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
            const { headerLineNum, isRunning } = arg;
            if (isRunning.flag) return;
            isRunning.flag = true;
            try {
                const [ , res ] = parseReplBlockAt(textEditor.document, headerLineNum);
                if (res === null) return;

                const { outputRange, commands, prefix } = res;

                const session = await startSession(ext, textEditor.document);
                await session.loading;
                await session.ghci.sendCommand(
                    `:module *${session.getModuleName(textEditor.document.uri.fsPath)}`);
                const response = await session.ghci.sendCommand(commands);
                if (response[0] == '') response.shift();
                if (response[response.length - 1] == '') response.pop();
                const filtRsponse = response.map(s => prefix + (s == '' ? '<BLANKLINE>' : s));
                const end = outputRange.isEmpty ? '\n' : '';
                const replacement = filtRsponse.map(s => s + '\n').join('') + prefix.replace(/\s+$/, '') + end;
                await textEditor.edit(e => e.replace(outputRange, replacement),
                    { undoStopBefore: ! arg.batch, undoStopAfter: ! arg.batch });
            } finally {
                isRunning.flag = false;
            }
        }
    }

    async function inlineReplRunAll(
        textEditor: vscode.TextEditor,
        edit: vscode.TextEditorEdit):
        Promise<void> {
        if (! availableRepl.has(textEditor.document)) return;
        textEditor.edit(() => {}, { undoStopBefore: true, undoStopAfter: false });
        for (const [ , cmd ] of availableRepl.get(textEditor.document))
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
            const [ lineNum1, res ] = parseReplBlockAt(document, lineNum);
            lineNum = lineNum1;
            if (res !== null) {
                const { headerRange } = res;
                const command: vscode.Command = {
                    title: 'Run in GHCi',
                    command: 'vscode-ghc-simple.inline-repl-run',
                    arguments: [
                        {
                            headerLineNum: headerRange.start.line,
                            isRunning: { flag: false }
                        }
                    ]
                };

                available.push([headerRange, command]);
                if (codeLensEnabled)
                    codeLenses.push(
                        new vscode.CodeLens(
                            document.lineAt(headerRange.start.line).range, command));
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
