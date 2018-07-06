'use strict';
import * as vscode from 'vscode';
import { registerRangeType } from './range-type';
import { registerCompletion } from './completion';
import { ExtensionState, computeWorkspaceType } from './extension-state';
import { registerDiagnostics } from './diagnostics';
import { registerDefinition } from './definition';

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('GHC');

    const ext: ExtensionState = {
        context,
        outputChannel,
        workspaceType: computeWorkspaceType(),
        sessionManagers: new Map(),
        singleManager: null
    }

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
        for (const [doc, session] of ext.sessionManagers) {
            session.dispose();
        }
        ext.sessionManagers.clear();
        if (ext.singleManager)
            ext.singleManager.dispose();

        ext.workspaceType = computeWorkspaceType();
    }));

    registerRangeType(ext);

    registerCompletion(ext);

    registerDiagnostics(ext);

    registerDefinition(ext);
}

export function deactivate() {
}
