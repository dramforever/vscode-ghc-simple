import * as vscode from 'vscode';
import * as path from 'path';
import { TextDocument, Disposable, DiagnosticSeverity } from 'vscode';
import { assert } from 'chai';

export type DocFun = (doc: TextDocument) => Thenable<void>;
export type AssertFun = (doc: TextDocument, diags: vscode.Diagnostic[]) => Thenable<void>;

export function runFileTest(file: string, diagsCount: number|[DiagnosticSeverity, number], asserts: AssertFun): Promise<void> {
  const [severety, count] = typeof diagsCount === 'number' ? [DiagnosticSeverity.Warning, diagsCount] : diagsCount;
  return withTestDocument(file, [severety, count], async doc => {
    const diagnostics = vscode.languages.getDiagnostics(doc.uri);
    await asserts(doc, diagnostics);
  });
}

export async function withTestDocument(filePath: string, diagnosticCount: [DiagnosticSeverity, number], test: DocFun, cleanup?: DocFun): Promise<void> { 
  const file = path.join(__dirname, '../../input', filePath);
  const doc = await didChangeDiagnostics(file, diagnosticCount, async () => {
    const doc = await vscode.workspace.openTextDocument(file);
    await vscode.window.showTextDocument(doc, { preview: false });
    return doc;
  });
  try {
    await test(doc);
  } finally {
    await cleanup?.(doc);
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }
}

export async function didChangeDiagnostics<T>(fsPath: string, [severety, count]: [DiagnosticSeverity, number], action: () => Thenable<T>) {
    return didEvent(
      vscode.languages.onDidChangeDiagnostics,
      e => {
        const uri = e.uris.find(uri => uri.fsPath === fsPath);
        if (uri) {
          const diags = vscode.languages.getDiagnostics(uri).filter(d => d.severity <= severety);
          assert.isAtMost(diags.length, count);
          return diags.length === count;
        } else {
          return false;
        }
      },
      action,
    );
}

export async function didEvent<TResult, TEvent>(
  subscribe: (arg: (event: TEvent) => void) => Disposable,
  predicate: (event: TEvent) => Boolean,
  action: () => Thenable<TResult>): Promise<TResult> {
  return new Promise<TResult>(async (resolve, _) => {
    const disposable = subscribe(async e => {
      if(predicate(e)) {
        disposable.dispose();
        resolve(await result);
      }
    });
    let result = action();
  });
}
