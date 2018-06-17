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

    start(): Promise<child_process.ChildProcess> {
        this.proc = child_process.spawn(this.command, this.args, this.options);
        this.stdout = this.makeReadline(this.proc.stdout);
        this.stderr = this.makeReadline(this.proc.stderr);
        this.proc.stdin.on('close', this.handleClose.bind(this));
        return this.sendCommand(':set prompt ""').then(() => {
            return this.proc;
        });
    }

    stop(): Promise<{}> {
        return this.sendCommand(':q');
    }

    restart(): Promise<child_process.ChildProcess> {
        if (process === null) {
            return this.start();
        } else {
            this.stop().then(() => {
                console.error('Quitting GHCi should not have succeeded!');
            }, (reason) => {
                return this.start();
            });
        }
    }

    currentCommand: {
        barrier: string,
        resolve: (result: string[]) => void,
        reject: (reason: any) => void,
        lines: string[]
    } | null = null;

    pendingCommands: PendingCommand[] = [];

    sendCommand(cmds: string | string[]): Promise<string[]> {
        const commands = (typeof cmds === 'string') ? [cmds] : cmds;

        if (this.proc === null) {
            return this.start().then(() => {
                return this._sendCommand(commands);
            })
        } else {
            return this._sendCommand(commands);
        }
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

        let isFirst = true;
        for (let c of commands) {
            if (isFirst) {
                this.output.appendLine('    -> ' + c);
                isFirst = false;
            } else {
                this.output.appendLine('    |> ' + c);
            }

            this.proc.stdin.write(c + '\n');
        }

        this.proc.stdin.write(`putStrLn "\\n${barrier}"\n`);

    }

    handleClose() {
        if (this.currentCommand !== null) {
            this.currentCommand.reject('stream closed');
            this.currentCommand = null;
        }

        for (let cmd of this.pendingCommands) {
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
