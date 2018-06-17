'use strict';

import * as vscode from 'vscode';

const regex = {

    // Groups:
    // 1: file
    // 2-3: variant 1: line:col
    // 4-6: variant 2: line:col-col
    // 7-10: variant 3: (line, col)
    message_base: /^(.+):(?:(\d+):(\d+)|(\d+):(\d+)-(\d+)|\((\d+),(\d+)\)-\((\d+),(\d+)\)): (.+)$/,
    single_line_error: /^error: (.+)$/,
    error: /^error:$/,
    warning: /^warning: \[(.+)\]$/
};

interface DiagnosticWithFile {
    file: string;
    diagnostic: vscode.Diagnostic;
}

export function parseMessages(messages: string[]):
    DiagnosticWithFile[] {
    const res: DiagnosticWithFile[] = [];

    while (messages.length > 0) {
        const heading = messages.shift();

        if (/^(Ok|Failed),(.*) loaded.$/.test(heading))
            break;

        const res_heading = regex.message_base.exec(heading);
        if (res_heading !== null) {
            let range: vscode.Range;

            function num(n: number): number { return parseInt(res_heading[n]); }

            if (res_heading[2]) {
                // line:col
                const line = num(2);
                const col = num(3);

                range = new vscode.Range(line - 1, col - 1, line - 1, col - 1);
            } else if (res_heading[4]) {
                // line:col-col
                const line = num(4);
                const col0 = num(5);
                const col1 = num(6);

                range = new vscode.Range(line - 1, col0 - 1, line - 1, col1);
            } else if (res_heading[7]) {
                // (line,col)-(line,col)
                const line0 = num(7);
                const col0 = num(8);
                const line1 = num(9);
                const col1 = num(10);

                range = new vscode.Range(line0 - 1, col0 - 1, line1 - 1, col1);
            } else {
                // Shouldn't happen!
                throw 'Strange heading in parseMessages';
            }

            const res_sl_error = regex.single_line_error.exec(res_heading[11]);
            const res_error = regex.error.exec(res_heading[11]);
            const res_warning = regex.warning.exec(res_heading[11]);

            const sev = vscode.DiagnosticSeverity;

            if (res_sl_error !== null) {
                res.push({
                    file: res_heading[1],
                    diagnostic: new vscode.Diagnostic(range, res_sl_error[1], sev.Error)
                });
            } else {
                const msgs: string[] = [];
                while (messages.length > 0 && messages[0].startsWith('    ')) {
                    msgs.push(messages.shift().substr(4));
                }
                const msg = msgs.join('\n') + (msgs.length ? '\n' : '');

                let severity: vscode.DiagnosticSeverity;

                if (res_error !== null) {
                    severity = sev.Error;
                } else if (res_warning !== null
                    && ['-Wdeferred-type-errors',
                        '-Wdeferred-out-of-scope-variables',
                        '-Wtyped-holes'
                    ].indexOf(res_warning[1]) >= 0) {
                    severity = sev.Error;
                } else if (res_warning !== null) {
                    severity = sev.Warning;
                } else {
                    throw 'Strange heading in parseMessages';
                }

                res.push({
                    file: res_heading[1],
                    diagnostic: new vscode.Diagnostic(range, msg, severity)
                });
            }
        }
    }

    return res;
}
