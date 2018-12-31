import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { GhciManager } from "./ghci";
import { ExtensionState } from "./extension-state";

export class Session implements vscode.Disposable {
    ghci: GhciManager;
    starting: Promise<void>;
    loading: Promise<void>;
    files: Set<string>;
    typeCache: string[] | null;

    constructor(public ext: ExtensionState) {
        this.ghci = null;
        this.loading = null;
        this.files = new Set();
        this.typeCache = null;
    }

    async start() {
        if (this.ghci === null) {
            const wst = await this.ext.workspaceType;

            const cmd = await (async () => {
                if (wst == 'stack') {
                    const result = await new Promise<string>((resolve, reject) => {
                        child_process.exec(
                            'stack ide targets',
                            { cwd: vscode.workspace.rootPath },
                            (err, stdout, stderr) => {
                                if (err) reject();
                                else resolve(stderr);
                            }
                        )
                    });
                    return ['stack', 'repl', '--no-load'].concat(result.match(/^[^\s]+$/gm));
                } else if (wst == 'cabal')
                    return ['cabal', 'repl'];
                else if (wst == 'bare-stack')
                    return ['stack', 'exec', 'ghci'];
                else if (wst == 'bare')
                    return ['ghci'];
            })();

            this.ghci = new GhciManager(
                cmd[0],
                cmd.slice(1),
                { cwd: vscode.workspace.rootPath, stdio: 'pipe' },
                this.ext);
            const config = vscode.workspace.getConfiguration('ghcSimple');
            const configureCommands = config.startupCommands.concat(
                wst === 'bare-stack' || wst === 'bare'
                ? config.bareStartupCommands
                : []);
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
        const res = await this.ghci.sendCommand([
            ':set +c',
            `:load ${[... this.files.values()].map(x => `*${x}`).join(' ')}`
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
