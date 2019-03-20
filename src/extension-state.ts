import * as child_process from 'child_process';
import * as vscode from 'vscode';
import { Session } from './session';

export type HaskellWorkspaceType = 'cabal' | 'cabal new' | 'cabal v2' | 'stack' | 'bare-stack' | 'bare';

export interface ExtensionState {
    context: vscode.ExtensionContext;
    outputChannel: vscode.OutputChannel;
    workspaceTypeMap: Map<vscode.WorkspaceFolder, Promise<HaskellWorkspaceType>>;
    documentManagers: Map<vscode.TextDocument, Session>;
    workspaceManagers: Map<vscode.WorkspaceFolder, Session>;
}

function getWorkspaceType(ext: ExtensionState, folder: vscode.WorkspaceFolder): Promise<HaskellWorkspaceType> {
    if (! ext.workspaceTypeMap.has(folder))
        ext.workspaceTypeMap.set(folder, computeWorkspaceType(folder.uri));
    return ext.workspaceTypeMap.get(folder);
}

export async function startSession(ext: ExtensionState, doc: vscode.TextDocument): Promise<Session> {
    const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
    const type = await getWorkspaceType(ext, folder);
    const session = (() => {
        if (-1 !== ['stack', 'cabal', 'cabal new', 'cabal v2'].indexOf(type)) {
            // stack or cabal

            if (! ext.workspaceManagers.has(folder))
                ext.workspaceManagers.set(folder, new Session(ext, folder));

            return ext.workspaceManagers.get(folder);
        } else {
            // bare or bare-stack

            if (! ext.documentManagers.has(doc))
                ext.documentManagers.set(doc, new Session(ext, folder));

            return ext.documentManagers.get(doc);
        }
    })();
    session.addFile(doc.uri.fsPath);
    return session;
}

export async function stopSession(ext: ExtensionState, doc: vscode.TextDocument) {
    const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
    const type = await getWorkspaceType(ext, folder);

    if (-1 !== ['cabal', 'stack'].indexOf(type)) {
        // stack or cabal
        if (ext.workspaceManagers.has(folder)) {
            const mgr = ext.workspaceManagers.get(folder);
            mgr.removeFile(doc.uri.fsPath);
        }
    } else {
        // bare or bare-stack
        if (ext.documentManagers.has(doc)) {
            ext.documentManagers.get(doc).dispose();
            ext.documentManagers.delete(doc);
        }
    }
}

export async function computeWorkspaceType(resource: vscode.Uri): Promise<HaskellWorkspaceType> {
    const configType =
        vscode.workspace.getConfiguration('ghcSimple', resource).workspaceType as
            HaskellWorkspaceType | 'detect';

    if (configType !== 'detect') return configType;

    const isStack = await vscode.workspace.findFiles('stack.yaml');
    if (isStack.length > 0)
        return 'stack';

    const isCabal = await vscode.workspace.findFiles('**/*.cabal');
    if (isCabal.length > 0)
        return 'cabal new';

    const hasStack = await new Promise<boolean>((resolve, reject) => {
            const cp = child_process.exec(
                'stack --help',
                {
                    cwd: vscode.workspace.getWorkspaceFolder(resource).uri.fsPath,
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
