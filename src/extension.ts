'use strict';
import * as vscode from 'vscode';
import * as path from 'path'
import * as child_process from 'child_process';

import { GhciManager } from "./ghci";
import { DocumentManager } from "./document";
import { parseMessages } from "./parse-messages";
import { StatusBarAlignment } from 'vscode';
import { registerRangeType } from './range-type';

let diagnosticCollection: vscode.DiagnosticCollection;

let docManagers: Map<vscode.TextDocument, DocumentManager> = new Map();

let ghciCommand: string[];

export function activate(context: vscode.ExtensionContext) {
    
    diagnosticCollection = vscode.languages.createDiagnosticCollection('ghc-simple');
    context.subscriptions.push(diagnosticCollection);

    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(checkHaskell));
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(checkHaskell));
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(stopMgr));

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
        for (let [doc, mgr] of docManagers) {
            mgr.dispose();
        }
        docManagers.clear();
    }));

    registerRangeType(context, docManagers);

}

function normalizePath(path_: string): string {
    path_ = path.normalize(path_);
    if (path_.length >= 2 && path_.charAt(0).match(/[a-z]/i) && path_.charAt(1) == ':') {
        return path_.charAt(0).toUpperCase() + path_.substr(1);
    } else {
        return path_;
    }
}

function stopMgr(document: vscode.TextDocument) {
    if (docManagers.has(document)) {
        docManagers.get(document).dispose();
        docManagers.delete(document);
    }
}

function checkHaskell(document: vscode.TextDocument) {
    if (document.languageId == 'haskell' || document.uri.fsPath.endsWith('.hs')) {
        console.log('check');
        let docMgr: DocumentManager = null;

        if (docManagers.has(document)) {
            docMgr = docManagers.get(document);
        } else {
            docMgr = new DocumentManager(document.uri.fsPath);
            docManagers.set(document, docMgr);
        }

        const loadP = docMgr.load();
        loadP.then((result) => {
            console.log(result);

            const normPath = normalizePath(document.uri.fsPath);

            console.log(normPath);

            const parsed = parseMessages(result);

            const filtered = parsed.
                filter((diag) => normalizePath(diag.file) === normPath).
                map((diag) => diag.diagnostic);

            diagnosticCollection.set(document.uri, filtered);
        })
    }
}

export function deactivate() {
}
