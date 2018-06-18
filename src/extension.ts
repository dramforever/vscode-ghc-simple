'use strict';
import * as vscode from 'vscode';
import * as path from 'path'
import * as child_process from 'child_process';

import { GhciManager } from "./ghci";
import { DocumentManager } from "./document";
import { parseMessages } from "./parse-messages";
import { StatusBarAlignment } from 'vscode';
import { registerRangeType } from './range-type';
import { registerCompletion } from './completion';
import { ExtensionState, computeWorkspaceType } from './extension-state';

let diagnosticCollection: vscode.DiagnosticCollection;

let ghciCommand: string[];

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('GHC');

    const ext: ExtensionState = {
        context,
        docManagers: new Map(),
        outputChannel,
        workspaceType: computeWorkspaceType()
    }

    diagnosticCollection = vscode.languages.createDiagnosticCollection('ghc-simple');
    context.subscriptions.push(diagnosticCollection);

    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((d) => checkHaskell(d, ext)));
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((d) => checkHaskell(d, ext)));
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((d) => stopMgr(d, ext)));

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
        for (let [doc, mgr] of ext.docManagers) {
            mgr.dispose();
        }
        ext.docManagers.clear();
        ext.workspaceType = computeWorkspaceType();
    }));

    registerRangeType(ext);

    registerCompletion(ext);
}

function normalizePath(path_: string): string {
    path_ = path.normalize(path_);
    if (path_.length >= 2 && path_.charAt(0).match(/[a-z]/i) && path_.charAt(1) == ':') {
        // VSCode likes d:\ but GHC likes D:\
        return path_.charAt(0).toUpperCase() + path_.substr(1);
    } else {
        return path_;
    }
}

function stopMgr(document: vscode.TextDocument, ext: ExtensionState) {
    if (ext.docManagers.has(document)) {
        ext.docManagers.get(document).dispose();
        ext.docManagers.delete(document);
    }
}

function checkHaskell(document: vscode.TextDocument, ext: ExtensionState) {
    if (document.languageId == 'haskell' || document.uri.fsPath.endsWith('.hs')) {
        let docMgr: DocumentManager = null;

        if (ext.docManagers.has(document)) {
            docMgr = ext.docManagers.get(document);
        } else {
            docMgr = new DocumentManager(document.uri.fsPath, ext);
            ext.docManagers.set(document, docMgr);
        }

        const loadP = docMgr.reload();
        loadP.then((result) => {
            const normPath = normalizePath(document.uri.fsPath);

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
