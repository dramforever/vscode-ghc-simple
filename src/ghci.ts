'use strict';

import * as child_process from 'child_process';
import * as readline from 'readline';
import { Disposable, OutputChannel, Extension } from "vscode";
import { ExtensionState } from './extension-state';

interface PendingCommand {
    commands: string[];
    resolve: (result: string[]) => void;
    reject: (reason: any) => void;
}

export class GhciManager implements Disposable {
    proc: child_process.ChildProcess | null;
    command: string;
    args: string[];
    options: any;
    stdout: readline.ReadLine;
    stderr: readline.ReadLine;
    output: OutputChannel

    constructor(command: string, args: string[], options: any, ext: ExtensionState) {
        this.proc = null;
        this.command = command;
        this.args = args;
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
        this.proc = child_process.spawn(this.command, this.args, this.options);
        this.stdout = this.makeReadline(this.proc.stdout);
        this.stderr = this.makeReadline(this.proc.stderr);
        this.proc.stdin.on('close', this.handleClose.bind(this));
        await this.sendCommand(':set prompt ""')
        return this.proc;
    }

    stop(): Promise<{}> {
        return this.sendCommand(':q');
    }

    async restart(): Promise<child_process.ChildProcess> {
        if (process === null) {
            return this.start();
        } else {
            try {
                await this.stop()
                console.error('Quitting GHCi should not have succeeded!');
            } catch (_reason) {
                return this.start();
            }
        }
    }

    currentCommand: {
        barrier: string,
        resolve: (result: string[]) => void,
        reject: (reason: any) => void,
        lines: string[]
    } | null = null;

    pendingCommands: PendingCommand[] = [];

    async sendCommand(cmds: string | string[]): Promise<string[]> {
        const commands = (typeof cmds === 'string') ? [cmds] : cmds;

        if (this.proc === null) {
            await this.start()
        }

        return this._sendCommand(commands);
    }

    _sendCommand(commands: string[]): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const pending: PendingCommand = { commands, resolve, reject };
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
