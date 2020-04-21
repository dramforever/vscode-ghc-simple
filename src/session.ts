import * as fs from 'fs';
import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { GhciManager, GhciOptions } from "./ghci";
import { ExtensionState, HaskellWorkspaceType } from "./extension-state";
import { stackCommand, reportError } from './utils';

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
        public resource: vscode.Uri,
        public ghciOptions: GhciOptions = new GhciOptions) {
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

            const getStackIdeTargets = async () => {
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
                    return `${stackCommand} repl --no-load${this.getStartOptions(' --ghci-options "', '"')} ${(await getStackIdeTargets()).join(' ')}`;
                } else if (wst == 'cabal')
                    return `cabal repl${this.getStartOptions(' --ghc-options "', '"')}`;
                else if (wst == 'cabal new')
                    return `cabal new-repl all${this.getStartOptions(' --ghc-options "', '"')}`;
                else if (wst == 'cabal v2')
                    return `cabal v2-repl all${this.getStartOptions(' --ghc-options "', '"')}`;
                else if (wst == 'bare-stack')
                    return `${stackCommand} exec ghci${this.getStartOptions(' -- ')}`;
                else if (wst == 'bare')
                    return `ghci${this.getStartOptions(' ')}`;
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
                this.ghciOptions.startupCommands.all || cmds.all,
                wst === 'bare-stack' || wst === 'bare' ? this.ghciOptions.startupCommands.bare || cmds.bare : [],
                this.ghciOptions.startupCommands.custom || cmds.custom
            );
            await this.ghci.sendCommand(configureCommands);

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

    removeFile(s: string) {
        this.files.delete(s);
    }

    async reload(): Promise<string[]> {
        this.typeCache = null;
        const pr = this.reloadP();
        this.loading = pr.then(() => undefined);
        return pr;
    }

    async reloadP(): Promise<string[]> {
        await this.start();
        const mods = [... this.files.values()];

        const res = await this.ghci.sendCommand([
            ... this.ghciOptions.reloadCommands || [],
            `:load ${mods.map(x => JSON.stringify(`*${x}`)).join(' ')}`
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
    ): Promise<string[]> {
        const module = this.getModuleName(uri.fsPath);

        return await this.ghci.sendCommand(
            [`:add *${uri.fsPath}`, `:m *${module}`],
            { token }
        );
    }

    getModuleName(filename: string): string {
        return this.moduleMap.get(filename);
    }

    getStartOptions(prefix?: string, postfix?: string): string {
        return this.ghciOptions.startOptions ?
            `${prefix ||''}${this.ghciOptions.startOptions}${postfix || ''}` :
            "";
    }

    dispose() {
        this.wasDisposed = true;
        if (this.ghci !== null)
            this.ghci.dispose();
    }
}
