import * as fs from 'fs';
import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { GhciManager } from "./ghci";
import { ExtensionState, HaskellWorkspaceType } from "./extension-state";
import { stackCommand } from './utils';

export class Session implements vscode.Disposable {
    ghci: GhciManager;
    starting: Promise<void> | null;
    loading: Promise<void>;
    files: Set<string>;
    typeCache: Promise<string[]> | null;
    moduleMap: Map<string, string>;
    cwdOption: { cwd?: string };
    basePath?: string;

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
        this.typeCache = null;
        this.moduleMap = new Map();
        this.cwdOption = resourceType == 'workspace' ? { cwd: this.resource.fsPath } : {};
        this.wasDisposed = false;
    }

    checkDisposed() {
        if (this.wasDisposed) throw 'session already disposed';
    }

    start() {
        if (this.starting === null) {
            this.starting = this.startP();
        }

        return this.starting;
    }

    async startP() {
        if (this.ghci === null) {
            const wst = this.workspaceType;

            const getStackIdeTargets = async () => {
                this.checkDisposed();
                const result = await new Promise<string>((resolve, reject) => {
                    child_process.exec(
                        `${stackCommand} ide targets --stdout`,
                        this.cwdOption,
                        (err, stdout, stderr) => {
                            if (err) reject('Command stack ide targets failed:\n' + stderr);
                            else resolve(stdout);
                        }
                    )
                });

                return result.match(/^[^\s]+$/gm);
            }

            this.checkDisposed();
            const cmd = await (async () => {
                if (wst == 'custom-workspace' || wst == 'custom-file') {
                    let cmd = vscode.workspace.getConfiguration('ghcSimple', this.resource).replCommand;
                    if (cmd.indexOf('$stack_ide_targets') !== -1) {
                        const sit = await getStackIdeTargets();
                        cmd.replace(/\$stack_ide_targets/g, sit.join(' '));
                    }
                    return cmd;
                } else if (wst == 'stack') {
                    return `${stackCommand} repl --no-load ${(await getStackIdeTargets()).join(' ')}`;
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
            })();

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
            try {
                await this.ghci.sendCommand(configureCommands);
            } catch(e) {
                this.ext.outputChannel.appendLine(`Error starting GHCi: ${e}`);
                vscode.window.showWarningMessage(
                    'Error while start GHCi. Further information might be found in output tab.');
            }
            try {
                const res = await this.ghci.sendCommand(':show paths');
                if (res.length < 1) {
                    throw new Error('":show paths" has too few lines');
                }
                // expect second line of the output to be current ghci path
                const basePath = res[1].trim();
                if (basePath.length <= 0 || basePath[0] != '/') {
                    throw new Error('Invalid path value: ${basePath}');
                }
                const doesExist = await new Promise(resolve => fs.exists(basePath, resolve));
                if (!doesExist) {
                    throw new Error('Detected path doesn\'t exist: ${basePath}');
                }
                this.ext.outputChannel.appendLine(`Detected base path: ${basePath}`);
                this.basePath = basePath;
            } catch(e) {
                this.ext.outputChannel.appendLine(`Error detecting base path: ${e}`);
                this.ext.outputChannel.appendLine('Will fallback to document\'s workspace folder');
            }
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
        if (vscode.workspace.getConfiguration('ghcSimple', this.resource).useObjectCode)
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

        this.moduleMap.clear();
        for (const line of modules) {
            const res = /^([^ ]+)\s+\( (.+), interpreted \)$/.exec(line);
            if (res) {
                this.moduleMap.set(vscode.Uri.file(res[2]).fsPath, res[1]);
            }
        }
        await this.ghci.sendCommand(':module');
        return res;
    }

    getModuleName(filename: string): string {
        return this.moduleMap.get(filename);
    }

    dispose() {
        this.wasDisposed = true;
        if (this.ghci !== null)
            this.ghci.dispose();
    }
}
