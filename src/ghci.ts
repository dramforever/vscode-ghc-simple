'use strict';

import * as child_process from 'child_process';
import * as readline from 'readline';
import { Disposable, CancellationToken } from "vscode";
import { ExtensionState } from './extension-state';

interface StrictCommandConfig {
    token: CancellationToken,
    info: string;
}

type CommandConfig = {
    [K in keyof StrictCommandConfig]?: StrictCommandConfig[K]
}

interface PendingCommand extends StrictCommandConfig {
    commands: string[];
    resolve: (result: string[]) => void;
    reject: (reason: any) => void;
}

export class GhciOptions {
    startOptions?: string;
    reloadCommands?: string[] = [
        ":set -fno-code",
        ":set +c"
    ];
    startupCommands?: {
        all?: string[];
        bare?: string[];
        custom?: string[];
    } = {}
}

export class GhciManager implements Disposable {
    proc: child_process.ChildProcess | null;
    command: string;
    options: any;
    stdout: readline.ReadLine;
    stderr: readline.ReadLine;
    ext: ExtensionState;

    wasDisposed: boolean;

    constructor(command: string, options: any, ext: ExtensionState) {
        this.proc = null;
        this.command = command;
        this.options = options;
        this.ext = ext;
        this.wasDisposed = false;
    }

    makeReadline(stream): readline.ReadLine {
        const res = readline.createInterface({
            input: stream
        });
        res.on('line', this.handleLine.bind(this));
        return res;
    }

    checkDisposed() {
        if (this.wasDisposed) throw 'ghci already disposed';
    }

    outputLine(line: string) {
        this.ext.outputChannel?.appendLine(line);
    }

    idle() {
        this.ext.statusBar?.update(this, {
            status: 'idle'
        });
    }

    busy(info: string | null = null) {
        this.ext.statusBar?.update(this, {
            status: 'busy',
            info
        })
    }

    async start(): Promise<child_process.ChildProcess> {
        this.checkDisposed();

        this.proc = child_process.spawn(this.command, {
            ... this.options,
            stdio: 'pipe',
            shell: true
        });
        this.proc.on('exit', () => { this.proc = null; });
        this.proc.on('error', () => { this.proc = null; });

        this.stdout = this.makeReadline(this.proc.stdout);
        this.stderr = this.makeReadline(this.proc.stderr);
        this.proc.stdin.on('close', this.handleClose.bind(this));
        await this.sendCommand([':set prompt ""', ':set prompt-cont ""'], {
            info: 'Starting'
        });

        return this.proc;
    }

    async stop(): Promise<void> {
        try {
            await this.sendCommand(':quit');
            throw 'Quitting ghci should not have succeeded';
        } catch (_reason) {
            return;
        }
    }

    kill() {
        if (this.proc !== null) {
            this.proc.kill();
            this.proc = null;
        }
    }

    currentCommand: {
        barrier: string,
        resolve: (result: string[]) => void,
        reject: (reason: any) => void,
        lines: string[]
    } | null = null;

    pendingCommands: PendingCommand[] = [];

    async sendCommand(
        cmds: string | string[],
        config: CommandConfig = {}):
        Promise<string[]> {
        if (config.token) {
            config.token.onCancellationRequested(
                this.handleCancellation.bind(this)
            );
        }

        const commands = (typeof cmds === 'string') ? [cmds] : cmds;

        if (this.proc === null) {
            await this.start()
        }

        return this._sendCommand(commands, config);
    }

    _sendCommand(commands: string[], config: CommandConfig = {}):
        Promise<string[]> {
        return new Promise((resolve, reject) => {
            this.checkDisposed();

            const nullConfig: StrictCommandConfig = {
                token: null,
                info: null
            };

            const pending: PendingCommand = {
                ... nullConfig,
                ... config,
                commands, resolve, reject
            };
            if (this.currentCommand === null) {
                this.launchCommand(pending);
            } else {
                this.pendingCommands.push(pending);
            }
        })
    }

    handleLine(line: string) {
        line = line.replace(/\ufffd/g, ''); // Workaround for invalid characters showing up in output
        this.outputLine(`ghci | ${line}`);
        if (this.currentCommand === null) {
            // Ignore stray line
        } else {
            if (this.currentCommand.barrier === line) {
                this.currentCommand.resolve(this.currentCommand.lines);
                this.currentCommand = null;
                this.handleCancellation();

                if (this.pendingCommands.length > 0) {
                    this.launchCommand(this.pendingCommands.shift());
                }
            } else {
                this.currentCommand.lines.push(line);
            }

            this.handleStatusUpdate(line);
        }
    }

    handleCancellation() {
        while (this.pendingCommands.length > 0
            && this.pendingCommands[0].token
            && this.pendingCommands[0].token.isCancellationRequested) {
            this.outputLine(`Cancel ${this.pendingCommands[0].commands}`);
            this.pendingCommands[0].reject('cancelled');
            this.pendingCommands.shift();
        }

        if (this.pendingCommands.length == 0)
            this.idle();
    }

    handleStatusUpdate(line: string) {
        {
            const compilingRegex = /^(\[\d+ +of +\d+\]) Compiling ([^ ]+)/;
            const match = line.match(compilingRegex);
            if (match) {
                this.busy(`${match[1]} ${match[2]}`);
            }
        }
        {
            if (line.startsWith('Collecting type info for')) {
                this.busy('Collecting type info');
            }
        }
    }

    launchCommand({ commands, info, resolve, reject }: PendingCommand) {
        const barrier = '===ghci_barrier_' + Math.random().toString() + '===';
        this.currentCommand = { resolve, reject, barrier, lines: [] };
        this.busy(info);

        if (commands.length > 0) {
            this.outputLine(`    -> ${commands[0]}`);
            for (const c of commands.slice(1))
                this.outputLine(`    |> ${c}`);
        }

        for (const c of commands) {
            this.proc.stdin.write(c + '\n');
        }

        this.proc.stdin.write(`Prelude.putStrLn "\\n${barrier}"\n`);

    }

    handleClose() {
        if (this.currentCommand !== null) {
            this.currentCommand.reject('stream closed');
            this.currentCommand = null;
        }

        for (const cmd of this.pendingCommands) {
            cmd.reject('stream closed');
        }

        this.pendingCommands.length = 0; // Clear pendingCommands
        this.dispose();
    }

    dispose() {
        this.wasDisposed = true;

        this.ext.statusBar?.remove(this);
        if (this.proc !== null) {
            this.proc.kill();
            this.proc = null;
        }
        this.stdout = null;
        this.stderr = null;
    }
}
