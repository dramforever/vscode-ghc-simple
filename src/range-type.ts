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
        borderColor: 'black',
        borderWidth: '0px 0px 1px 0px',
        before: {
            color: '#999',
            margin: '2px'
        }
    });

    let sbItem = vscode.window.createStatusBarItem(StatusBarAlignment.Left);

    context.subscriptions.push(sbItem);


    context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection((event) => {
        if (selTimeout !== null) {
            clearTimeout(selTimeout);
        }
        const sel = event.selections[0];

        selTimeout = setTimeout(() => {
            if (docManagers.has(event.textEditor.document)) {
                const mgr = docManagers.get(event.textEditor.document);
                mgr.getType(sel).then((res) => {
                    if (res !== null) {
                        const [range, type] = res;
                        event.textEditor.setDecorations(decoCurrent, [{
                            hoverMessage: type,
                            range: range
                        }]);
                        sbItem.text = type;
                        sbItem.show();
                    } else {
                        event.textEditor.setDecorations(decoCurrent, []);
                        sbItem.hide();
                    }
                })
            }
            selTimeout = null;
        }, 300);

    }));
}