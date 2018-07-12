import * as vscode from 'vscode';
import { ExtensionState, startSession } from './extension-state';
import { Session } from './session';

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

    const typesB: string[] =
        session.typeCache !== null
        ? session.typeCache
        : await session.ghci.sendCommand(':all-types');

    session.typeCache = typesB;

    const strTypes = typesB.filter((x) => x.startsWith(doc.uri.fsPath));

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
        // :all-types gives types with implicit forall type variables,
        // but :kind! doesn't like them, so we try to patch this fact

        const re = /[A-Za-z0-9_']*/g
        const typeVariables = curType.match(re).filter((u) =>
            u.length && u !== 'forall' && /[a-z]/.test(u[0]));
        const forallPart = `forall ${[...new Set(typeVariables)].join(' ')}.`
        const fullType = `${forallPart} ${curType}`;
        
        const res = await session.ghci.sendCommand([
            ':seti -XExplicitForAll -XKindSignatures',
            `:kind! ((${fullType}) :: *)`]);

        const resolved: null | string = (() => {
            // GHCi may output warning messages before the response
            while (res.length && ! res[0].startsWith(`${fullType} ::`)) res.shift();

            if (res.length && res[1].startsWith('= ')) {
                res.shift();
                res[0] = res[0].slice(1); // Skip '=' on second line
                return res.join(' ').replace(/\s{2,}/g, ' ');
            } else {
                return null;
            }
        })();

        if (resolved) {
            return [curBestRange, resolved];
        } else {
            return [curBestRange, curType.replace(/([A-Z][A-Za-z0-9_']*\.)+([A-Za-z0-9_']+)/g, '$2')];
        }
    }
}

export function registerRangeType(ext: ExtensionState) {
    const context = ext.context;
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
        const doc = event.textEditor.document;
        if (doc.languageId !== 'haskell' && ! doc.uri.fsPath.endsWith('.hs'))
            return;
        
        if (doc.isDirty) {
            event.textEditor.setDecorations(decoCurrent, []);
            event.textEditor.setDecorations(decoType, []);
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
                    event.textEditor.setDecorations(decoCurrent, [{
                        range,
                        hoverMessage: type
                    }]);
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
                selTimeout = null;
            }, 300);
        }
    }));
}