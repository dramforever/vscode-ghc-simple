import * as vscode from 'vscode';
import { Session } from './session';
import { StatusBar } from '../features/status-bar';
import * as config from './config';
import { kill } from 'process';

export type HaskellWorkspaceType = 'custom-workspace' | 'custom-file' | 'cabal' | 'cabal new' | 'cabal v2' | 'stack' | 'bare-stack' | 'bare';

export interface SessionState {
    session: Session;
    key: config.ConfigKey | null;
    documents: Set<vscode.TextDocument>;
}

export interface ExtensionState {
    context: vscode.ExtensionContext;
    outputChannel: vscode.OutputChannel;
    statusBar: StatusBar;

    sharableSessions: Map<string, SessionState>;
    documentSessions: Map<vscode.TextDocument, SessionState>;
}

let compatibilityWarningLastShown = -1;

export async function startSession(ext: ExtensionState, doc: vscode.TextDocument): Promise<Session | null> {
    function displayCompatibilityWarning() {
        const conf = vscode.workspace.getConfiguration('ghcSimple', doc);
        const configWorkspaceType = conf.workspaceType;

        if (configWorkspaceType && configWorkspaceType !== 'detect') {
            if (+ new Date() - compatibilityWarningLastShown < 1000) {
                return;
            }

            compatibilityWarningLastShown = + new Date();

            vscode.window.showWarningMessage(
                'The configuration workspaceType no longer has any effect. Please use provide an hie.yaml. See extension readme for details. Remove from settings to dismiss.',
                'Remove workspaceType configuration'
            ).then((opt) => {
                compatibilityWarningLastShown = + new Date();
                if (opt == 'Remove workspaceType configuration') {
                    const insp = conf.inspect('workspaceType');
                    if (insp.globalValue)
                        conf.update('workspaceType', undefined, true);
                    if (insp.workspaceValue)
                        conf.update('workspaceType', undefined, false);
                }
            });
        }
    }

    if (ext.documentSessions.has(doc)) {
        return ext.documentSessions.get(doc).session;
    }

    const conf = await config.fileConfig(doc.uri);
    if (conf === null) return null;

    const keyString = conf.key && config.configKeyToString(conf.key);

    if (conf.key !== null) {
        if (ext.sharableSessions.has(keyString)) {
            ext.outputChannel.appendLine(`Reuse existing for ${doc.uri.fsPath}, key = ${keyString}`);
            const state = ext.sharableSessions.get(keyString);
            state.documents.add(doc);
            ext.documentSessions.set(doc, state);
            state.session.addFile(doc.uri.fsPath);
            return state.session;
        }
    }

    ext.outputChannel.appendLine(`Starting for ${doc.uri.fsPath}, key = ${keyString}`);
    const session = new Session(ext, conf.command, conf.cwd, doc.uri);

    displayCompatibilityWarning();
    const state: SessionState = {
        session,
        key: conf.key,
        documents: new Set([doc])
    };

    let isDisposed = false;

    const watchers = conf.dependencies.map((glob) => {
        const w = vscode.workspace.createFileSystemWatcher(glob);
        w.onDidChange(killSession);
        w.onDidCreate(killSession);
        w.onDidDelete(killSession);
        return w;
    })

    function killSession() {
        if (isDisposed) return;
        isDisposed = true;

        for (const w of watchers) {
            w.dispose();
        }

        session.dispose();

        for (const doc of state.documents)
            ext.documentSessions.delete(doc);

        if (conf.key !== null) {
            ext.sharableSessions.delete(keyString);
        }
    }

    ext.documentSessions.set(doc, state);
    if (conf.key !== null) {
        ext.sharableSessions.set(keyString, state);
    }
    state.session.addFile(doc.uri.fsPath);
    return session;
}

export function stopSession(ext: ExtensionState, doc: vscode.TextDocument) {
    const cfg = vscode.workspace.getConfiguration('ghcSimple', doc);

    if (! ext.documentSessions.has(doc)) {
        return; // Nothing to stop
    }

    const state = ext.documentSessions.get(doc);
    state.session.removeFile(doc.uri.fsPath);
    state.documents.delete(doc);
    ext.documentSessions.delete(doc);

    if (state.documents.size === 0
        && (state.key === null || ! cfg.replLinger)) {
        state.session.dispose();
        ext.sharableSessions.delete(config.configKeyToString(state.key));
    }
}
