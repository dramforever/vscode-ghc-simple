import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { Disposable } from 'vscode';
import { GhciManager } from './ghci';
import { ExtensionState, HaskellWorkspaceType } from './extension-state';


export class DocumentManager implements Disposable {
    ghci: GhciManager;
    path: string;
    typeCache: null | string[];
    starting: Thenable<void>;
    loading: Thenable<void>;
    ext: ExtensionState;

    makeGhci(ghciCommand: string[]) {
        this.ghci = new GhciManager(
            ghciCommand[0],
            ghciCommand.slice(1),
            { cwd: vscode.workspace.rootPath, stdio: 'pipe' },
            this.ext);
    }

    constructor(path_: string, ext: ExtensionState) {
        this.path = path_;
        this.ghci = null;
        this.ext = ext
        this.starting = this.start();
    }

    async start(): Promise<void> {
        const wst = await this.ext.workspaceType;

        const cmd = await (async () => {
            if (wst == 'stack') {
                const result = await new Promise<string>((resolve, reject) => {
                    const cp = child_process.exec(
                        'stack ide targets',
                        { cwd: vscode.workspace.rootPath },
                        (err, stdout, stderr) => {
                            if (err) reject();
                            else resolve(stderr);
                        }
                    )
                });
                return ['stack', 'repl', '--no-load'].concat(result.split(/\r?\n/)).slice(0, -1);
            } else if (wst == 'cabal')
                return ['cabal', 'repl'];
            else if (wst == 'bare-stack')
                return ['stack', 'exec', 'ghci'];
            else if (wst == 'bare')
                return ['ghci'];
        })();

        this.ext.outputChannel.appendLine(`Starting ghci using: ${cmd.join(' ')}`);

        this.makeGhci(cmd);
        const configure = ':set -fno-diagnostics-show-caret -fdiagnostics-color=never -ferror-spans -fdefer-type-errors -Wall';
        await this.ghci.sendCommand(configure);
    }

    clear() {
        this.typeCache = null;
    }

    dispose() {
        this.ghci.dispose();
    }

    async loadP(): Promise<string[]> {
        await this.starting;
        return await this.ghci.sendCommand([':set +c', ':l ' + this.path]);
    }

    reload(): Promise<string[]> {
        this.clear();
        const pr = this.loadP();
        this.loading = pr.then(() => undefined);
        return pr;
    }
}