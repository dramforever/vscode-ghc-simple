'use strict';
import * as vscode from 'vscode';
import { registerRangeType } from './range-type';
import { registerCompletion } from './completion';
import { ExtensionState, startSession } from './extension-state';
import { registerDiagnostics } from './diagnostics';
import { registerDefinition } from './definition';
import { registerReference } from './reference';
import { registerInlineRepl } from './inline-repl';
import { StatusBar } from './status-bar'
import { registerHover } from './hover';
import { Session } from './session';
import { GhciOptions } from './ghci';

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('GHC');
    const documentAssignment = new WeakMap();
    const statusBar = new StatusBar(documentAssignment);

    const ext: ExtensionState = {
        context,
        outputChannel,
        statusBar,
        documentManagers: new Map(),
        workspaceManagers: new Map(),
        workspaceTypeMap: new Map(),
        documentAssignment
    };

    context.subscriptions.push(outputChannel, statusBar);

    registerRangeType(ext);
    registerCompletion(ext);
    registerDefinition(ext);
    registerReference(ext);
    registerInlineRepl(ext);
    registerHover(ext);

    const diagInit = registerDiagnostics(ext);

    function restart() {
        for (const [doc, session] of ext.documentManagers) {
            session.dispose();
        }

        ext.documentManagers.clear();

        for (const [ws, session] of ext.workspaceManagers) {
            session.dispose();
        }

        ext.workspaceManagers.clear();

        ext.documentAssignment = new WeakMap();

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
        vscode.commands.registerCommand('vscode-ghc-simple.restart', restart),
        vscode.commands.registerCommand('vscode-ghc-simple.openOutput', openOutput));

    vscode.workspace.onDidChangeWorkspaceFolders((changeEvent) => {
        for (const folder of changeEvent.removed)
            if (ext.workspaceManagers.has(folder))
                ext.workspaceManagers.get(folder).dispose();
    });

    /**
     * Simple GHC Api
     */
    interface Api {
        /**
         * [output channel](#vscode.OutputChannel) containing GHCi output
         */
        outputChannel: vscode.OutputChannel;
        /**
         * Create a new GHCi session
         * @param doc Current document
         * @param ghciOptions Various options to be passed to GHCi
         * @returns `Promise` with newly created `Session`
         */
        startSession: (doc: vscode.TextDocument, ghciOptions?: GhciOptions) => Promise<Session>;
    }

    let api = {
        /**
         * Create new instance of Simple GHC API  
         * Call this function only once, probably during extension activation
         * @param context Calling extension context
         * @param channel Output channel for GHCi output. New session will use existing `GHC` channel if ommited
         * @returns Simple GHC `Api`
         */
        startApi(context: vscode.ExtensionContext, channel?: vscode.OutputChannel): Api {
            const ext = {
                context,
                outputChannel: channel || outputChannel,
                statusBar: null,
                documentManagers: new Map(),
                workspaceManagers: new Map(),
                workspaceTypeMap: new Map(),
                documentAssignment: new WeakMap()
            };
            return {
                outputChannel: ext.outputChannel,
                startSession: (doc, ghciOptions?) =>
                    startSession(ext, doc, ghciOptions)
            };
        }
    }
    return api;
}

export function deactivate() {
}
