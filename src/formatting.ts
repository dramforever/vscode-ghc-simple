import * as vscode from 'vscode';
import * as proc from 'child_process';
import { haskellSelector, getFeatures } from './utils';
import { ExtensionState } from './extension-state';

// TODO: This could be eventually configured by the user (pick ormolu, brittany, hindent, etc...)
const formatterCommand = 'ormolu'

function provideDocumentRangeFormattingEdits(
    document: vscode.TextDocument,
    range: vscode.Range,
    _: vscode.FormattingOptions,
    __: vscode.CancellationToken
): vscode.ProviderResult<vscode.TextEdit[]> {
    if (!getFeatures(document.uri).codeFormatting) {
        // Formatting disabled by the user
        return null;
    }
    const text = document.getText(range);
    let formattedText: string;
    try {
        formattedText = proc.execSync(formatterCommand, { input: text }).toString();
        return [vscode.TextEdit.replace(range, formattedText)];
    } catch (e) {
        let cause: string = e.message
            .replace(`Command failed: ${formatterCommand}`, '')
            .replace(/:\s.*\n.*<stdin>/g, '')
            .trim()
        vscode.window.showErrorMessage(`Ormolu failed to format the code. ${cause}`);
    }
    return [];
}

export function registerCodeFormatting(ext: ExtensionState) {
    try {
        proc.execSync(`${formatterCommand} --help`);
        ext.context.subscriptions.push(vscode.languages.registerDocumentRangeFormattingEditProvider(
            haskellSelector,
            { provideDocumentRangeFormattingEdits }
        ));
    } catch (e) {
        vscode.window.showWarningMessage("Ormolu is not installed. Code formatting is disabled");
    }
} 