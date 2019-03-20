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
        documentManagers: new Map(),
        workspaceManagers: new Map(),
        workspaceTypeMap: new Map()
    };

    (global as any)._ext = ext;
    
    registerRangeType(ext);
    
    registerCompletion(ext);
    
    const diagInit = registerDiagnostics(ext);
    
    async function restart(): Promise<void> {
        const stops = [];

        for (const [doc, session] of ext.documentManagers) {
            if (session.ghci)
                stops.push(session.ghci.stop());
        }

        ext.documentManagers.clear();

        for (const [ws, session] of ext.workspaceManagers) {
            if (session.ghci)
                stops.push(session.ghci.stop());
        }

        ext.workspaceManagers.clear();

        await Promise.all(stops);

        diagInit();
    }

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(restart),
        vscode.commands.registerCommand('vscode-ghc-simple.restart', restart));

    vscode.workspace.onDidChangeWorkspaceFolders((changeEvent) => {
        for (const folder of changeEvent.removed)
            if (ext.workspaceManagers.has(folder))
                ext.workspaceManagers.get(folder).dispose();
    })

    registerDefinition(ext);
}

export function deactivate() {
}
