import * as child_process from 'child_process';
import * as vscode from 'vscode';
import { Session } from './session';

export type HaskellWorkspaceType = 'cabal' | 'stack' | 'bare-stack' | 'bare';

export interface ExtensionState {
    context: vscode.ExtensionContext;
    outputChannel: vscode.OutputChannel;
    workspaceType: Promise<HaskellWorkspaceType>;
    sessionManagers: Map<vscode.TextDocument, Session>;
    singleManager: Session;
}

export async function startSession(ext: ExtensionState, doc: vscode.TextDocument): Promise<Session> {
    const wst = await ext.workspaceType;
    const session = (() => {
        if (-1 !== ['stack', 'cabal'].indexOf(wst)) {
            // stack or cabal

            if (ext.singleManager === null)
                ext.singleManager = new Session(ext);

            return ext.singleManager;
        } else {
            // bare or bare-stack

            if (! ext.sessionManagers.has(doc))
                ext.sessionManagers.set(doc, new Session(ext));

            return ext.sessionManagers.get(doc);
        }
    })();
    session.addFile(doc.uri.fsPath);
    return session;
}

export async function stopSession(ext: ExtensionState, doc: vscode.TextDocument) {
    const wst = await ext.workspaceType;
    if (-1 !== ['cabal', 'stack'].indexOf(wst)) {
        // stack or cabal
        if (ext.singleManager !== null)
            ext.singleManager.removeFile(doc.uri.fsPath);
    } else {
        // bare or bare-stack
        if (ext.sessionManagers.has(doc)) {
            ext.sessionManagers.get(doc).dispose();
            ext.sessionManagers.delete(doc);
        }
    }
}

export async function computeWorkspaceType(): Promise<HaskellWorkspaceType> {
    const configType =
        vscode.workspace.getConfiguration('ghcSimple').workspaceType as
            HaskellWorkspaceType | 'detect';

    if (configType !== 'detect') return configType;

    const isStack = await vscode.workspace.findFiles('stack.yaml');
    if (isStack.length > 0)
        return 'stack';
    
    const isCabal = await vscode.workspace.findFiles('**/*.cabal');
    if (isCabal.length > 0)
        return 'cabal';

    const hasStack = await new Promise<boolean>((resolve, reject) => {
            const cp = child_process.exec(
                'stack --help',
                {
                    cwd: vscode.workspace.rootPath,
                    timeout: 5000
                }, (err, stdout, stderr) => {
                    if (err) resolve(false);
                    else resolve(true);
                }
            )
        });

    if (hasStack)
        return 'bare-stack'
    else
        return 'bare';
}
