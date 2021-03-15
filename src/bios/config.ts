import * as child_process from 'child_process';
import * as vscode from 'vscode';
import { getStackIdeTargets } from '../utils';
import * as hie from './hie-bios';

/**
 * The key of a configuration, if applicable. Designed to be deterministically
 * serializable (see `configKeyToString`).
 */
export interface ConfigKey {
    type: string;
    [k: string]: string;
}

/**
 * Deterministically serialize a ConfigKey to a string, for use in equality
 * comparison and tables. The format is compatible with JSON.
 *
 * @param key Key object to serialize
 */
export function configKeyToString(key: ConfigKey): string {
    const keys = Object.keys(key).sort();
    const fmt = JSON.stringify.bind(JSON);
    const gen = (k: string) => `${fmt(k)}:${fmt(key[k])}`;
    return '{' + keys.map(gen).join(',') + '}';
}

export interface Configuration {
    /**
     * Identifies whether the underlying GHCi process is sharable. If two
     * configurations have a sharing key and the key is the same, they can share
     * a GHCi.
     */
    key: null | ConfigKey ;

    /**
     * The command to run, in the form of shell command string or argument list
     */
    command: string | string[];

    /**
     * The directory to run command in
     */
    cwd?: string,

    /**
     * When files listed here change, the configuration is invalidated
     */
    dependencies: vscode.GlobPattern[];
}


/** Detect if stack is available */
function hasStack(): Promise<boolean> {
    const opts = { timeout: 5000 };
    return new Promise<boolean>((resolve, reject) => {
        child_process.exec(
            'stack --help',
            opts,
            (err, stdout, stderr) => {
                if (err) resolve(false);
                else resolve(true);
            }
        )
    });
}

/**
 * Configuration for a single file
 *
 * @param cwd The working directory associated with the file
 */
async function singleConfig(cwd?: string): Promise<Configuration> {
    if (await hasStack()) {
        return {
            key: null,
            command: 'stack exec ghci',
            cwd,
            dependencies: []
        };
    } else {
        return {
            key: null,
            command: 'ghci',
            cwd,
            dependencies: []
        }
    }
}

/** Configuration for a custom command */
async function customConfig(
    replScope: 'workspace' | 'file',
    replCommand: string,
    workspaceUri: vscode.Uri
): Promise<Configuration> {
    if (replCommand.indexOf('$stack_ide_targets') !== -1) {
        const sit = await this.getStackIdeTargets();
        replCommand.replace(/\$stack_ide_targets/g, sit.join(' '));
    }

    return {
        key: replScope === 'file'
            ? null
            : { type: 'custom-workspace', uri: workspaceUri.toString() },
        cwd: workspaceUri.fsPath,
        command: replCommand,
        dependencies: []
    };
}

function pathIsPrefix(a: string, b: string): boolean {
    const aLevels = a.split('/');
    const bLevels = b.split('/');
    if (aLevels.length > bLevels.length) return false;

    for (let i = 0; i < aLevels.length; i ++) {
        if (aLevels[i] != bLevels[i]) return false;
    }

    return true;
}

async function hieBiosConfig(
    workspace: vscode.WorkspaceFolder,
    docUri: vscode.Uri
): Promise<Configuration | null> {
    const hieConfig = await hie.getCradleConfig(workspace.uri);

    const findMulti = <A>(multi: hie.Multi<A>): null | (A & hie.HasPath) => {
        let found: null | (A & hie.HasPath) = null;
        for (const cur of multi) {
            const pathUri = vscode.Uri.joinPath(workspace.uri, cur.path);
            if (! pathIsPrefix(pathUri.fsPath, docUri.fsPath)) {
                continue;
            }

            if (found === null || pathIsPrefix(found.path, pathUri.fsPath)) {
                found = cur;
            }
        }

        return found;
    }

    const worker = (config: hie.HieConfig): Configuration => {

        const makeCabalConfig = (component: string): Configuration => ({
            key: {
                type: 'hie-bios-cabal',
                uri: workspace.uri.toString(),
                component: component
            },
            cwd: workspace.uri.fsPath,
            command: [ 'cabal', 'repl', component ],
            dependencies:  [
                ... config.dependencies || [],
                new vscode.RelativePattern(workspace, 'hie.yaml'),
                new vscode.RelativePattern(workspace, '*.cabal')
            ]
        });

        const makeStackConfig = (component: string): Configuration => ({
            key: {
                type: 'hie-bios-stack',
                uri: workspace.uri.toString(),
                component: component
            },
            cwd: workspace.uri.fsPath,
            command: [ 'stack', 'repl', component ],
            dependencies:  [
                ... config.dependencies || [],
                new vscode.RelativePattern(workspace, 'hie.yaml'),
                new vscode.RelativePattern(workspace, '*.cabal'),
                new vscode.RelativePattern(workspace, 'package.yaml'),
                new vscode.RelativePattern(workspace, 'stack.yaml'),
            ]
        });

        const cradle = config.cradle;

        if ('cabal' in cradle) {
            if (Array.isArray(cradle.cabal)) { // multi
                const res = findMulti(cradle.cabal);
                if (res === null) {
                    return null;
                } else {
                    return makeCabalConfig(res.component);
                }
            } else {
                return makeCabalConfig(cradle.cabal.component);
            }
        } else if ('stack' in cradle) {
            if (Array.isArray(cradle.stack)) {
                const res = findMulti(cradle.stack);
                if (res === null) {
                    return null;
                } else {
                    return makeStackConfig(res.component);
                }
            } else {
                return makeStackConfig(cradle.stack.component);
            }
        } else if ('multi' in cradle) {
            const res = findMulti(cradle.multi);
            return worker(res.config);
        } else if ('none' in cradle) {
            return null;
        }
    };

    return worker(hieConfig);
}

/** Detect the configuration of a `TextDocument` */
export async function fileConfig(docUri: vscode.Uri): Promise<Configuration | null> {
    const workspace = vscode.workspace.getWorkspaceFolder(docUri);

    if (! workspace) return singleConfig();

    const config =
        vscode.workspace.getConfiguration('ghcSimple', workspace.uri);

    const replCommand: string = config.replCommand;
    const replScope: 'workspace' | 'file' = config.replScope;

    if (replCommand !== '') {
        // Custom REPL command
        return customConfig(replScope, replCommand, workspace.uri);
    }

    const find = async (pattern: string) =>
        await vscode.workspace.findFiles(
            new vscode.RelativePattern(workspace, pattern));

    if ((await find('hie.yaml')).length > 0) {
        // hie-bios cradle
        return hieBiosConfig(workspace, docUri);
    }

    const makeCabalConfig = (): Configuration => ({
        key: {
            type: 'detect-cabal',
            uri: workspace.uri.toString(),
        },
        cwd: workspace.uri.fsPath,
        command: [ 'cabal', 'v2-repl', 'all' ],
        dependencies:  [
            new vscode.RelativePattern(workspace, '*.cabal'),
            new vscode.RelativePattern(workspace, 'cabal.project')
        ]
    });

    const makeStackConfig = (targets: string[]): Configuration => ({
        key: {
            type: 'detect-stack',
            uri: workspace.uri.toString(),
        },
        cwd: workspace.uri.fsPath,
        command: [ 'stack', 'repl', ... targets],
        dependencies:  [
            new vscode.RelativePattern(workspace, '*.cabal'),
            new vscode.RelativePattern(workspace, 'package.yaml'),
            new vscode.RelativePattern(workspace, 'stack.yaml'),
        ]
    });

    if ((await find('stack.yaml')).length > 0) {
        try {
            return makeStackConfig(await getStackIdeTargets());
        } catch (e) {
            // Try others
        }
    }

    if ((await find('*.cabal')).length > 0 || (await find('cabal.project')).length > 0) {
        return makeCabalConfig();
    }

    return singleConfig();
}