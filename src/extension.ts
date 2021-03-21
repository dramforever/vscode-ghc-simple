'use strict';
import * as vscode from 'vscode';
import { registerRangeType } from './features/range-type';
import { registerCompletion } from './features/completion';
import { ExtensionState } from './bios/extension-state';
import { registerDiagnostics } from './features/diagnostics';
import { registerDefinition } from './features/definition';
import { registerReference } from './features/reference';
import { registerInlineRepl } from './features/inline-repl';
import { StatusBar } from './features/status-bar'
import { registerHover } from './features/hover';

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('GHC');
    const documentSessions = new Map();
    const sharableSessions = new Map();
    const statusBar = new StatusBar(documentSessions);

    const ext: ExtensionState = {
        context,
        outputChannel,
        statusBar,
        documentSessions,
        sharableSessions
    };

    context.subscriptions.push(outputChannel, statusBar);

    registerRangeType(ext);
    registerCompletion(ext);
    registerDefinition(ext);
    registerReference(ext);
    registerInlineRepl(ext);
    registerHover(ext);

    const diagInit = registerDiagnostics(ext);

    function killEverything() {
        const disposed = new Set();

        for (const [_doc, state] of ext.documentSessions) {
            if (! disposed.has(state)) {
                state.session.dispose();
                disposed.add(state);
            }
        }

        for (const [_keyString, state] of ext.sharableSessions) {
            if (! disposed.has(state)) {
                state.session.dispose();
                disposed.add(state);
            }
        }

        ext.documentSessions.clear();
        ext.sharableSessions.clear();
    }

    function restart() {
        killEverything();
        diagInit();
    }

    function openOutput() {
        ext.outputChannel.show();
    }

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('ghcSimple'))
                restart();
        }),
        { dispose: killEverything },
        vscode.commands.registerCommand('vscode-ghc-simple.restart', restart),
        vscode.commands.registerCommand('vscode-ghc-simple.openOutput', openOutput));

    vscode.workspace.onDidChangeWorkspaceFolders(() => {
        restart();
    })
}

export function deactivate() {
}
