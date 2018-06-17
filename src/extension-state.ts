import * as vscode from 'vscode';
import { DocumentManager } from './document';

export interface ExtensionState {
    context: vscode.ExtensionContext;
    docManagers: Map<vscode.TextDocument, DocumentManager>;
    outputChannel: vscode.OutputChannel;
}