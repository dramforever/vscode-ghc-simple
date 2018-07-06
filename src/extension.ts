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
    
    registerRangeType(ext);
    
    registerCompletion(ext);
    
    const diagInit = registerDiagnostics(ext);
    
    async function restart(): Promise<void> {
        const stops = [];

        for (const [doc, session] of ext.sessionManagers) {
            if (session.ghci)
                stops.push(session.ghci.stop());
        }
        ext.sessionManagers.clear();

        if (ext.singleManager.ghci)
            stops.push(ext.singleManager.ghci.stop());
        
        await Promise.all(stops);

        ext.workspaceType = computeWorkspaceType();

        diagInit();
    }

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(restart),
        vscode.commands.registerCommand('vscode-ghc-simple.restart', restart));

    registerDefinition(ext);
}

export function deactivate() {
}
