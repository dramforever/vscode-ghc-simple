import * as vscode from 'vscode';
import { runFileTest } from './utils';
import { DiagnosticSeverity } from 'vscode';
import { assert } from 'chai';


const settings = new Map(Object.entries({
  'telemetry.enableTelemetry': false,
  'ghcSimple.replCommand': 'stack exec ghci',
  'ghcSimple.replScope': 'file',
}));

suite('', () => {
  suiteSetup(async () => {
    const config = vscode.workspace.getConfiguration();
    for (const [setting, value] of settings) { 
      await config.update(setting, value, true);
    }

    await vscode.commands.executeCommand('workbench.actions.view.problems');
  });
  
  test('OK (no diagnostics)', () => {
      return runFileTest('OK.hs', 0, async () => {
    });
  });

  test('Warning only', () => {
    return runFileTest('Warning.hs', 1, async (_, diags) => {
      assert.lengthOf(diags, 1);
      assert.include(diags[0]?.message, 'Top-level binding with no type signature');
    });
  });

  test('Error only', () => {
    return runFileTest('Error.hs', [DiagnosticSeverity.Error, 1], async (_, diags) => {
      assert.lengthOf(diags, 1);
      assert.include(diags[0]?.message, 'Not in scope: type constructor or class');
    });
  });

  suiteTeardown(async () => {
    const config = vscode.workspace.getConfiguration();
    for (const setting in settings) { 
      await config.update(setting, undefined, true);
    }
  });
});
