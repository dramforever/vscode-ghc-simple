import * as path from 'path';
import * as vscode from 'vscode';

export const haskellSymbolRegex = /([A-Z][A-Za-z0-9_']*\.)*([!#$%&*+./<=>?@\^|\-~:]+|[A-Za-z_][A-Za-z0-9_']*)/;
export const haskellReplLine = /^(\s*-{2,}\s+)?>>>(.*)$/;

export const haskellSelector: vscode.DocumentSelector = [
    { language: 'haskell', scheme: 'file' },
    { language: 'literate haskell', scheme: 'file' }
];

export function documentIsHaskell(doc: vscode.TextDocument) {
    return (
        [ 'haskell', 'literate haskell' ].indexOf(doc.languageId) !== -1
        || [ '.hs', '.lhs' ].some(suf => doc.uri.fsPath.endsWith(suf)));
}

export function strToLocation(s: string, workspaceRoot: string): null | vscode.Location {
    const locR = /^(.+):\((\d+),(\d+)\)-\((\d+),(\d+)\)$/;
    const ma = s.match(locR);
    if (ma) {
        const [_all, file, startLine, startCol, endLine, endCol] = ma;
        return new vscode.Location(
            vscode.Uri.file(path.resolve(workspaceRoot, file)),
            new vscode.Range(
                new vscode.Position(+ startLine - 1, + startCol - 1),
                new vscode.Position(+ endLine - 1, + endCol - 1)));
    } else {
        return null;
    }
}

export function getFeatures(resource: vscode.Uri): { [k: string]: any } {
    return vscode.workspace.getConfiguration('ghcSimple', resource).feature;
}
