import * as vscode from 'vscode';
import { Disposable, Range, Selection, Position } from 'vscode';
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
        const cmdTable: { [k in HaskellWorkspaceType]: string[] } = {
            'stack': ['stack', 'repl'],
            'cabal': ['cabal', 'repl'],
            'bare-stack': ['stack', 'exec', 'ghci'],
            'bare': ['ghci'],
        };
        this.makeGhci(cmdTable[wst]);
        const configure = ':set -fno-diagnostics-show-caret -fdiagnostics-color=never -ferror-spans -fdefer-type-errors -Wall';
        return this.ghci.sendCommand(configure).then(() => {});
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