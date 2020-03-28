import * as child_process from 'child_process';
import * as vscode from 'vscode';
import { Session } from './session';

export type HaskellWorkspaceType = 'custom-workspace' | 'custom-file' | 'cabal' | 'cabal new' | 'cabal v2' | 'stack' | 'bare-stack' | 'bare';

export interface ExtensionState {
    context: vscode.ExtensionContext;
    outputChannel: vscode.OutputChannel;
    workspaceTypeMap: Map<vscode.WorkspaceFolder, Promise<HaskellWorkspaceType>>;
    documentManagers: Map<vscode.TextDocument, Session>;
    workspaceManagers: Map<vscode.WorkspaceFolder, Session>;
    documentAssignment: WeakMap<
        vscode.TextDocument,
        { type: 'document' } | { type: 'workspace', folder: vscode.WorkspaceFolder }
    >;
}

function getWorkspaceType(ext: ExtensionState, folder: vscode.WorkspaceFolder): Promise<HaskellWorkspaceType> {
    if (! ext.workspaceTypeMap.has(folder))
        ext.workspaceTypeMap.set(folder, computeWorkspaceType(folder));
    return ext.workspaceTypeMap.get(folder);
}

export async function startSession(ext: ExtensionState, doc: vscode.TextDocument): Promise<Session> {
    const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
    const type = folder === undefined
        ? await computeFileType()
        : await getWorkspaceType(ext, folder);

    const session = (() => {
        if (-1 !== ['custom-workspace', 'stack', 'cabal', 'cabal new', 'cabal v2'].indexOf(type)) {
            // stack or cabal

            if (! ext.workspaceManagers.has(folder))
                ext.workspaceManagers.set(folder, new Session(ext, type, 'workspace', folder.uri));

            ext.documentAssignment.set(doc, {
                type: 'workspace',
                folder: folder
            });

            return ext.workspaceManagers.get(folder);
        } else {
            // bare or bare-stack

            if (! ext.documentManagers.has(doc))
                ext.documentManagers.set(doc, new Session(ext, type, 'file', doc.uri));

            ext.documentAssignment.set(doc, {
                type: 'document'
            });

            return ext.documentManagers.get(doc);
        }
    })();
    session.addFile(doc.uri.fsPath);
    return session;
}

export function stopSession(ext: ExtensionState, doc: vscode.TextDocument) {
    const assignment = ext.documentAssignment.get(doc);
    if (assignment.type === 'workspace') {
        if (ext.workspaceManagers.has(assignment.folder))
            ext.workspaceManagers.get(assignment.folder).removeFile(doc.uri.fsPath);
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
