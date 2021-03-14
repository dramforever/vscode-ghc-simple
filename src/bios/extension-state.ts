import * as child_process from 'child_process';
import * as vscode from 'vscode';
import { Session } from './session';
import { StatusBar } from '../features/status-bar';

export type HaskellWorkspaceType = 'custom-workspace' | 'custom-file' | 'cabal' | 'cabal new' | 'cabal v2' | 'stack' | 'bare-stack' | 'bare';

export interface ExtensionState {
    context: vscode.ExtensionContext;
    outputChannel: vscode.OutputChannel;
    statusBar: StatusBar;
    workspaceTypeMap: Map<vscode.WorkspaceFolder, Promise<HaskellWorkspaceType>>;
    documentManagers: Map<vscode.TextDocument, Session>;
    workspaceManagers: Map<vscode.WorkspaceFolder, Session>;
    documentAssignment: WeakMap<vscode.TextDocument, Session>;
}

function getWorkspaceType(ext: ExtensionState, folder: vscode.WorkspaceFolder): Promise<HaskellWorkspaceType> {
    if (! ext.workspaceTypeMap.has(folder))
        ext.workspaceTypeMap.set(folder, computeWorkspaceType(folder));
    return ext.workspaceTypeMap.get(folder);
}

let compatibilityWarningLastShown = -1;

export async function startSession(ext: ExtensionState, doc: vscode.TextDocument): Promise<Session> {
    const folder = vscode.workspace.getWorkspaceFolder(doc.uri);


    const type = folder === undefined
        ? await computeFileType()
        : await getWorkspaceType(ext, folder);

    function displayCompatibilityWarning() {
        const conf = vscode.workspace.getConfiguration('ghcSimple', folder.uri);
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

    const session = (() => {
        if (-1 !== ['custom-workspace', 'stack', 'cabal', 'cabal new', 'cabal v2'].indexOf(type)) {
            // stack or cabal

            if (! ext.workspaceManagers.has(folder)) {
                displayCompatibilityWarning();
                ext.workspaceManagers.set(folder,
                    new Session(ext, type, 'workspace', folder.uri));
            }

            return ext.workspaceManagers.get(folder);
        } else {
            // bare or bare-stack

            if (! ext.documentManagers.has(doc)) {
                displayCompatibilityWarning();
                ext.documentManagers.set(doc,
                    new Session(ext, type, 'file', doc.uri));
            }

            return ext.documentManagers.get(doc);
        }
    })();

    ext.documentAssignment.set(doc, session);

    session.addFile(doc.uri.fsPath);
    return session;
}

export function stopSession(ext: ExtensionState, doc: vscode.TextDocument) {
    const session = ext.documentAssignment.get(doc);
    if (session.resourceType === 'workspace') {
        const workspace = vscode.workspace.getWorkspaceFolder(session.resource)
        vscode.workspace.getWorkspaceFolder(session.resource);
        if (ext.workspaceManagers.has(workspace))
            ext.workspaceManagers.get(workspace).removeFile(doc.uri.fsPath);
    } else {
        if (ext.documentManagers.has(doc)) {
            ext.documentManagers.get(doc).dispose();
            ext.documentManagers.delete(doc);
        }
    }
}

function hasStack(cwd?: string): Promise<boolean> {
    const cwdOpt = cwd === undefined ? {} : { cwd };
    return new Promise<boolean>((resolve, reject) => {
        const cp = child_process.exec(
            'stack --help',
            Object.assign({ timeout: 5000 }, cwdOpt),
            (err, stdout, stderr) => {
                if (err) resolve(false);
                else resolve(true);
            }
        )
    });

}

export async function computeFileType(): Promise<HaskellWorkspaceType> {
    if (await hasStack())
        return 'bare-stack'
    else
        return 'bare';
}

export async function computeWorkspaceType(folder: vscode.WorkspaceFolder): Promise<HaskellWorkspaceType> {
    const customCommand =
        vscode.workspace.getConfiguration('ghcSimple', folder.uri).replCommand;

    if (customCommand !== "") {
        const customScope =
            vscode.workspace.getConfiguration('ghcSimple', folder.uri).replScope;

        if (customScope == "workspace")
            return 'custom-workspace';
        else
            return 'custom-file';
    }

    const oldConfigType =
        vscode.workspace.getConfiguration('ghcSimple', folder.uri).workspaceType as
            HaskellWorkspaceType | 'detect';

    if (oldConfigType !== 'detect') return oldConfigType;

    const find: (file: string) => Thenable<vscode.Uri[]> =
        (file) => vscode.workspace.findFiles(
            new vscode.RelativePattern(folder, file));

    const isStack = await find('stack.yaml');
    if (isStack.length > 0)
        return 'stack';

    const isCabal = await find('*.cabal');
    if (isCabal.length > 0)
        return 'cabal new';

    if (await hasStack(folder.uri.fsPath))
        return 'bare-stack'
    else
        return 'bare';
}
