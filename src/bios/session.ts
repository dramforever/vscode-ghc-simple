import * as fs from 'fs';
import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { GhciManager } from "./ghci";
import { ExtensionState, HaskellWorkspaceType } from "./extension-state";
import { stackCommand, reportError } from '../utils';

export class Session implements vscode.Disposable {
    ghci: GhciManager;
    starting: Promise<void> | null;
    loading: Promise<void>;
    files: Set<string>;
    onWillReload: vscode.Event<void>;
    onWillReloadEmitter: vscode.EventEmitter<void>;
    moduleMap: Map<string, string>;
    cwdOption: { cwd?: string };
    basePath?: string;
    lastReload: string[] | null;

    wasDisposed: boolean;

    constructor(
        public ext: ExtensionState,
        public workspaceType: HaskellWorkspaceType,
        public resourceType: 'workspace' | 'file',
        public resource: vscode.Uri) {
        this.ghci = null;
        this.starting = null;
        this.loading = null;
        this.files = new Set();
        this.onWillReloadEmitter = new vscode.EventEmitter();
        this.onWillReload = this.onWillReloadEmitter.event;
        this.moduleMap = new Map();
        this.cwdOption = resourceType == 'workspace' ? { cwd: this.resource.fsPath } : {};
        this.wasDisposed = false;
        this.lastReload = null;
    }

    checkDisposed() {
        if (this.wasDisposed) throw 'session already disposed';
    }

    start() {
        if (this.starting === null) {
            this.starting = this.startP();
            this.starting.catch(err => {
                if (this.wasDisposed) {
                    // We are disposed so do not report error
                    return;
                }
                reportError(this.ext, err.toString());
                vscode.window.showWarningMessage(
                    'Error while starting GHCi.',
                    'Open log'
                ).then(
                    (item) => {
                        if (item === 'Open log') {
                            this.ext.outputChannel.show();
                        }
                    },
                    (err) => console.error(err)
                );
            })
        }

        return this.starting;
    }

    async startP() {
        if (this.ghci === null) {
            const wst = this.workspaceType;

            this.checkDisposed();
            const cmd = await this.getGhciCommand();

            this.ext.outputChannel.appendLine(`Starting GHCi with: ${JSON.stringify(cmd)}`);
            this.ext.outputChannel.appendLine(
                `(Under ${
                    this.cwdOption.cwd === undefined
                        ? 'default cwd'
                        : `cwd ${this.cwdOption.cwd}` })`);

            this.checkDisposed();
            this.ghci = new GhciManager(
                cmd,
                this.cwdOption,
                this.ext);
            const cmds = vscode.workspace.getConfiguration('ghcSimple.startupCommands', this.resource);
            const configureCommands = [].concat(
                cmds.all,
                wst === 'bare-stack' || wst === 'bare' ? cmds.bare : [],
                cmds.custom
            );
            await this.ghci.sendCommand(configureCommands);

            this.basePath = await this.generateBasePath();
        }
    }

    async getStackIdeTargets() {
        this.checkDisposed();
        const result = await new Promise<string>((resolve, reject) => {
            child_process.exec(
                `${stackCommand} ide targets`,
                this.cwdOption,
                (err, stdout, stderr) => {
                    if (err) reject('Command stack ide targets failed:\n' + stderr);
                    else resolve(stderr);
                }
            )
        });

        return result.match(/^[^\s]+:[^\s]+$/gm)
    }

    async getGhciCommand() {
        const wst = this.workspaceType;

        if (wst == 'custom-workspace' || wst == 'custom-file') {
            let cmd = vscode.workspace.getConfiguration('ghcSimple', this.resource).replCommand;
            if (cmd.indexOf('$stack_ide_targets') !== -1) {
                const sit = await this.getStackIdeTargets();
                cmd.replace(/\$stack_ide_targets/g, sit.join(' '));
            }
            return cmd;
        } else if (wst == 'stack') {
            return `${stackCommand} repl --no-load ${(await this.getStackIdeTargets()).join(' ')}`;
        } else if (wst == 'cabal')
            return 'cabal repl';
        else if (wst == 'cabal new')
            return 'cabal new-repl all';
        else if (wst == 'cabal v2')
            return 'cabal v2-repl all';
        else if (wst == 'bare-stack')
            return `${stackCommand} exec ghci`;
        else if (wst == 'bare')
            return 'ghci';
    }

    async generateBasePath(): Promise<string | undefined> {
        try {
            const res = await this.ghci.sendCommand(':show paths');
            if (res.length < 1) {
                throw new Error('":show paths" has too few lines');
            }
            // expect second line of the output to be current ghci path
            const basePath = res[1].trim();
            if (basePath.length <= 0 || basePath[0] != '/') {
                throw new Error(`Invalid path value: ${basePath}`);
            }
            const doesExist = await new Promise(resolve => fs.exists(basePath, resolve));
            if (!doesExist) {
                throw new Error(`Detected path doesn\'t exist: ${basePath}`);
            }
            this.ext.outputChannel.appendLine(`Detected base path: ${basePath}`);
            return basePath;
        } catch(e) {
            this.ext.outputChannel.appendLine(`Error detecting base path: ${e}`);
            this.ext.outputChannel.appendLine('Will fallback to document\'s workspace folder');
            return undefined;
        }
    }

    addFile(s: string) {
        this.files.add(s);
    }

    removeFile(s: string) {
        this.files.delete(s);
    }

    async reload(): Promise<string[]> {
        this.onWillReloadEmitter.fire();
        const pr = this.reloadP();
        this.loading = pr.then(() => undefined);
        return pr;
    }

    async reloadP(): Promise<string[]> {
        await this.start();
        const mods = [... this.files.values()];
        mods.sort();

        const sameModules = (
            this.lastReload
            && this.lastReload.length == mods.length
            && this.lastReload.every((val, i) => val === mods[i]));

        this.lastReload = mods;

        const res = await this.ghci.sendCommand([
            ':set +c',
            sameModules
                ? ':reload'
                : `:load ${mods.map(x => JSON.stringify(`*${x}`)).join(' ')}`
        ], { info: 'Loading' });
        const modules = await this.ghci.sendCommand(':show modules');

        this.moduleMap.clear();
        for (const line of modules) {
            const res = /^([^ ]+)\s+\( (.+), .+ \)$/.exec(line);
            if (res) {
                this.moduleMap.set(vscode.Uri.file(res[2]).fsPath, res[1]);
            }
        }
        await this.ghci.sendCommand(':module');
        return res;
    }

    async loadInterpreted(
        uri: vscode.Uri,
        token: vscode.CancellationToken = null
    ): Promise<void> {
        const module = this.getModuleName(uri.fsPath);

        await this.ghci.sendCommand(
            [`:m *${module}`],
            { token }
        );
    }

    getModuleName(filename: string): string {
        return this.moduleMap.get(filename);
    }

    dispose() {
        this.wasDisposed = true;
        if (this.ghci !== null)
            this.ghci.dispose();
        this.onWillReloadEmitter.dispose();
    }
}
