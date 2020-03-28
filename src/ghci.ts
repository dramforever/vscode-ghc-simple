'use strict';

import * as child_process from 'child_process';
import * as readline from 'readline';
import { Disposable, OutputChannel, CancellationToken } from "vscode";
import { ExtensionState } from './extension-state';

interface PendingCommand {
    token: CancellationToken | null
    commands: string[];
    resolve: (result: string[]) => void;
    reject: (reason: any) => void;
}

export class GhciManager implements Disposable {
    proc: child_process.ChildProcess | null;
    command: string;
    options: any;
    stdout: readline.ReadLine;
    stderr: readline.ReadLine;
    output: OutputChannel

    constructor(command: string, options: any, ext: ExtensionState) {
        this.proc = null;
        this.command = command;
        this.options = options;
        this.output = ext.outputChannel;
    }

    makeReadline(stream): readline.ReadLine {
        const res = readline.createInterface({
            input: stream
        });
        res.on('line', this.handleLine.bind(this));
        return res;
    }

    async start(): Promise<child_process.ChildProcess> {
        this.proc = child_process.spawn(this.command, {
            ... this.options,
            shell: true
        });
        this.proc.on('exit', () => { this.proc = null; });
        this.proc.on('error', () => { this.proc = null; });

        this.stdout = this.makeReadline(this.proc.stdout);
        this.stderr = this.makeReadline(this.proc.stderr);
        this.proc.stdin.on('close', this.handleClose.bind(this));
        await this.sendCommand(':set prompt ""')
        await this.sendCommand(':set prompt-cont ""')
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

    async restart(): Promise<child_process.ChildProcess> {
        if (process === null) {
            return this.start();
        } else {
            await this.stop();
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
        token: CancellationToken | null = null):
        Promise<string[]> {
        const commands = (typeof cmds === 'string') ? [cmds] : cmds;

        if (this.proc === null) {
            await this.start()
        }

        return this._sendCommand(commands, token);
    }

    _sendCommand(
        commands: string[],
        token: CancellationToken | null):
        Promise<string[]> {
        return new Promise((resolve, reject) => {
            const pending: PendingCommand = { token, commands, resolve, reject };
            if (this.currentCommand === null) {
                this.launchCommand(pending);
            } else {
                this.pendingCommands.push(pending);
            }
        })
    }

    handleLine(line: string) {
        line = line.replace(/\ufffd/g, ''); // Workaround for invalid characters showing up in output
        this.output.appendLine(`ghci | ${line}`);
        if (this.currentCommand === null) {
            // Ignore stray line
        } else {
            if (this.currentCommand.barrier === line) {
                this.currentCommand.resolve(this.currentCommand.lines);
                this.currentCommand = null;
                while (
                    this.pendingCommands.length > 0
                    && this.pendingCommands[0].token !== null
                    && this.pendingCommands[0].token.isCancellationRequested) {
                    this.output.appendLine(`Cancel ${this.pendingCommands[0].commands}`);
                    this.pendingCommands[0].reject('cancelled');
                    this.pendingCommands.shift();
                }

                if (this.pendingCommands.length > 0) {
                    this.launchCommand(this.pendingCommands.shift());
                }
            } else {
                this.currentCommand.lines.push(line);
            }
        }
    }

    launchCommand({ commands, resolve, reject }: PendingCommand) {
        const barrier = '===ghci_barrier_' + Math.random().toString() + '===';
        this.currentCommand = { resolve, reject, barrier, lines: [] };

        if (commands.length > 0) {
            this.output.appendLine(`    -> ${commands[0]}`);
            for (const c of commands.slice(1))
                this.output.appendLine(`    |> ${c}`);
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
        if (this.proc !== null) {
            this.proc.kill();
            this.proc = null;
        }
        this.stdout = null;
        this.stderr = null;
    }
}
