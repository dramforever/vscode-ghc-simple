import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { GhciManager } from "./ghci";
import { ExtensionState } from "./extension-state";

export class Session implements vscode.Disposable {
    ghci: GhciManager;
    starting: Promise<void>;
    loading: Promise<void>;
    files: Set<string>;
    typeCache: Promise<string[]> | null;

    constructor(public ext: ExtensionState, public workspaceFolder: vscode.WorkspaceFolder) {
        this.ghci = null;
        this.loading = null;
        this.files = new Set();
        this.typeCache = null;
    }

    async start() {
        if (this.ghci === null) {
            const wst = await this.ext.workspaceTypeMap.get(this.workspaceFolder);

            const cmd = await (async () => {
                if (wst == 'stack') {
                    const result = await new Promise<string>((resolve, reject) => {
                        child_process.exec(
                            'stack ide targets',
                            { cwd: this.workspaceFolder.uri.fsPath },
                            (err, stdout, stderr) => {
                                if (err) reject('Command stack ide targets failed:\n' + stderr);
                                else resolve(stderr);
                            }
                        )
                    });
                    return ['stack', 'repl', '--no-load'].concat(result.match(/^[^\s]+$/gm));
                } else if (wst == 'cabal')
                    return ['cabal', 'repl'];
                else if (wst == 'cabal new')
                    return ['cabal', 'new-repl'];
                else if (wst == 'cabal v2')
                    return ['cabal', 'v2-repl'];
                else if (wst == 'bare-stack')
                    return ['stack', 'exec', 'ghci'];
                else if (wst == 'bare')
                    return ['ghci'];
            })();

            this.ghci = new GhciManager(
                cmd[0],
                cmd.slice(1),
                { cwd: this.workspaceFolder.uri.fsPath, stdio: 'pipe' },
                this.ext);
            const cmds = vscode.workspace.getConfiguration('ghcSimple.startupCommands', this.workspaceFolder.uri);
            const configureCommands = [].concat(
                cmds.all,
                wst === 'bare-stack' || wst === 'bare' ? cmds.bare : [],
                cmds.custom
            );
            await this.ghci.sendCommand(configureCommands);
        }
    }

    addFile(s: string) {
        this.files.add(s);
    }

    async removeFile(s: string): Promise<void> {
        this.files.delete(s);
    }

    async reload(): Promise<string[]> {
        this.typeCache = null;
        const pr = this.reloadP();
        this.loading = pr.then(() => undefined);
        return await pr;
    }

    async reloadP(): Promise<string[]> {
        await this.start();
        const loadCommand = `:load ${[... this.files.values()].map(x => JSON.stringify(`*${x}`)).join(' ')}`;
        if (vscode.workspace.getConfiguration('ghcSimple.useObjectCode', this.workspaceFolder.uri))
            await this.ghci.sendCommand([
                ':set -fobject-code',
                loadCommand
            ]);

        const res = await this.ghci.sendCommand([
            ':set -fbyte-code',
            ':set +c',
            loadCommand
        ]);
        const modules = await this.ghci.sendCommand(':show modules');
        const mmap = new Map<string, string>();
        for (const line of modules) {
            const res = /^([^ ]+)\s+\( (.+), interpreted \)$/.exec(line);
            if (res) {
                mmap.set(vscode.Uri.file(res[2]).fsPath, res[1]);
            }
        }
        await this.ghci.sendCommand(`:module ${
            [... this.files]
                .filter(m => mmap.has(m))
                .map(m => `*${mmap.get(m)}`).join(' ')
        }`);
        return res;
    }

    dispose() {
        if (this.ghci !== null)
            this.ghci.stop();
    }
}
