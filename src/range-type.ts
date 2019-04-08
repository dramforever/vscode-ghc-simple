import * as vscode from 'vscode';
import { ExtensionState, startSession } from './extension-state';
import { Session } from './session';
import { getFeatures, documentIsHaskell } from './utils';

async function getType(
    session: Session,
    sel: vscode.Selection | vscode.Position | vscode.Range,
    doc: vscode.TextDocument):
    Promise<null | [vscode.Range, string]> {

    const selRangeOrPos: vscode.Range | vscode.Position = (() => {
        if (sel instanceof vscode.Selection) {
            return new vscode.Range(sel.start, sel.end);
        } else {
            return sel;
        }
    })();

    if (session.loading === null) {
        session.reload();
    }

    await session.loading;

    await session.ghci.sendCommand(
        `:module *${session.getModuleName(doc.uri.fsPath)}`);

    if (session.typeCache === null)
        session.typeCache = session.ghci.sendCommand(':all-types');

    const typesB = await session.typeCache;

    const strTypes = typesB.filter((x) => x.startsWith(doc.uri.fsPath));

    // file:(l,c)-(l,c): type
    const allTypes = strTypes.map((x) =>
        /^:\((\d+),(\d+)\)-\((\d+),(\d+)\): (.*)$/.exec(x.substr(doc.uri.fsPath.length)));

    let curBestRange: null | vscode.Range = null, curType: null | string = null;

    for (const [_whatever, startLine, startCol, endLine, endCol, type] of allTypes) {
        const curRange = new vscode.Range(+startLine - 1, +startCol - 1, +endLine - 1, +endCol - 1);
        if (curRange.contains(selRangeOrPos)) {
            if (curBestRange === null || curBestRange.contains(curRange)) {
                curBestRange = curRange;
                curType = type;
            }
        }
    }

    if (curType === null) {
        return null;
    } else {
        const res = await session.ghci.sendCommand(
            `:type-at ${JSON.stringify(doc.uri.fsPath)}`
            + ` ${curBestRange.start.line + 1} ${curBestRange.start.character + 1}`
            + ` ${curBestRange.end.line + 1} ${curBestRange.end.character + 1}`);
        const resStr = res.map(l => l.trim()).join(' ');

        if (resStr.startsWith(':: '))
            return [curBestRange, resStr.slice(':: '.length)];
        else
            return [curBestRange, curType.replace(/([A-Z][A-Za-z0-9_']*\.)+([A-Za-z0-9_']+)/g, '$2')];
    }
}

export function registerRangeType(ext: ExtensionState) {
    const context = ext.context;
    let selTimeout: NodeJS.Timer | null = null;

    const deco = {
        borderStyle: 'solid',
        borderColor: '#66f'
    }

    // ______
    const decoCurrent = vscode.window.createTextEditorDecorationType(
        Object.assign({}, deco, { borderWidth: '0px 0px 1px 0px' }));

    // |
    const decoMultiLine = vscode.window.createTextEditorDecorationType(
        Object.assign({}, deco, { borderWidth: '0px 0px 0px 1px' }));

    // |_____
    const decoLastLine = vscode.window.createTextEditorDecorationType(
        Object.assign({}, deco, { borderWidth: '0px 0px 1px 1px' }));

    const decoType = vscode.window.createTextEditorDecorationType({
        after: { color: '#999' },
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    })

    context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection((event) => {
        const doc = event.textEditor.document;
        if (! getFeatures(doc.uri).rangeType)
            // Range type disabled by user
            return;

        if (! documentIsHaskell(doc))
            return;

        function clear() {
            event.textEditor.setDecorations(decoCurrent, []);
            event.textEditor.setDecorations(decoType, []);
            event.textEditor.setDecorations(decoMultiLine, []);
            event.textEditor.setDecorations(decoLastLine, []);
        }

        if (doc.isDirty) {
            clear();
        } else {
            if (selTimeout !== null) {
                clearTimeout(selTimeout);
            }

            const sel = event.selections[0];

            selTimeout = setTimeout(async () => {
                const session = await startSession(ext, doc);
                const res = await getType(session, sel, doc);
                if (res !== null) {
                    const [range, type] = res;
                    const lineRange = doc.lineAt(range.start.line).range;
                    const singleLine = range.start.line == range.end.line;
                    if (singleLine) {
                        event.textEditor.setDecorations(decoCurrent, [{
                            range,
                            hoverMessage: type
                        }]);
                        event.textEditor.setDecorations(decoMultiLine, []);
                        event.textEditor.setDecorations(decoLastLine, []);
                    } else {
                        const lastLineRange = doc.lineAt(range.end.line).range;
                        event.textEditor.setDecorations(decoCurrent, [{
                            range: lineRange.with({ start: range.start }),
                            hoverMessage: type
                        }]);
                        if (range.end.line == range.start.line + 1)
                            event.textEditor.setDecorations(decoMultiLine, []);
                        else
                            event.textEditor.setDecorations(decoMultiLine, [{
                                range: new vscode.Range(
                                    doc.lineAt(range.start.line + 1).range.start,
                                    doc.lineAt(range.end.line - 1).range.end)
                            }]);
                        event.textEditor.setDecorations(decoLastLine, [{
                            range: lastLineRange.with({ end: range.end })
                        }]);
                    }
                    const typeText = singleLine ? ` :: ${type}` : `... :: ${type}`;
                    event.textEditor.setDecorations(decoType, [{
                        range: lineRange,
                        renderOptions: {
                            after: { contentText: typeText }
                        }
                    }]);
                } else {
                    clear();
                }
                selTimeout = null;
            }, 300);
        }
    }));
}
