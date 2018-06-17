import * as vscode from 'vscode';
import { DocumentManager } from './document';
import { StatusBarAlignment } from 'vscode';
import { ExtensionState } from './extension-state';

export function registerRangeType(ext: ExtensionState) {
    const context = ext.context
    const docManagers = ext.docManagers;
    let selTimeout: NodeJS.Timer | null = null;

    const decoCurrent = vscode.window.createTextEditorDecorationType({
        borderStyle: 'solid',
        borderColor: '#66f',
        borderWidth: '0px 0px 1px 0px'
    });

    const decoType = vscode.window.createTextEditorDecorationType({
        after: {
            color: '#999',
            margin: '0px 0px 0px 20px'
        },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    })

    context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection((event) => {
        if (selTimeout !== null) {
            clearTimeout(selTimeout);
        }
        const sel = event.selections[0];

        selTimeout = setTimeout(() => {
            const doc = event.textEditor.document;
            if (! doc.isDirty && docManagers.has(doc)) {
                const mgr = docManagers.get(doc);
                mgr.getType(sel).then((res) => {
                    if (res !== null) {
                        const [range, type] = res;
                        const lineRange = doc.lineAt(range.start.line).range;
                        event.textEditor.setDecorations(decoCurrent, [{range}]);
                        event.textEditor.setDecorations(decoType, [{
                            range: lineRange,
                            renderOptions: {
                                after: {
                                    contentText: `:: ${type}`
                                }
                            }
                        }]);
                    } else {
                        event.textEditor.setDecorations(decoCurrent, []);
                        event.textEditor.setDecorations(decoType, []);
                    }
                })
            }
            selTimeout = null;
        }, 300);

    }));
}