import * as child_process from 'child_process';
import * as vscode from 'vscode';
import { DocumentManager } from './document';

export type HaskellWorkspaceType = 'cabal' | 'stack' | 'bare-stack' | 'bare';

export interface ExtensionState {
    context: vscode.ExtensionContext;
    docManagers: Map<vscode.TextDocument, DocumentManager>;
    outputChannel: vscode.OutputChannel;
    workspaceType: Promise<HaskellWorkspaceType>;
}

export async function computeWorkspaceType(): Promise<HaskellWorkspaceType> {
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
