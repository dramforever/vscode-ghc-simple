'use strict';
import * as vscode from 'vscode';
import { registerRangeType } from './range-type';
import { registerCompletion } from './completion';
import { ExtensionState, computeWorkspaceType } from './extension-state';
import { registerDiagnostics } from './diagnostics';

let ghciCommand: string[];

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('GHC');

    const ext: ExtensionState = {
        context,
        docManagers: new Map(),
        outputChannel,
        workspaceType: computeWorkspaceType()
    }

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
        for (let [doc, mgr] of ext.docManagers) {
            mgr.dispose();
        }
        ext.docManagers.clear();
        ext.workspaceType = computeWorkspaceType();
    }));

    registerRangeType(ext);

    registerCompletion(ext);

    registerDiagnostics(ext);
}

export function deactivate() {
}
