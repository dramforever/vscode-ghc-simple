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

const stackOptions = ["--no-terminal", "--color", "never"]

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

const alreadyShown = new Set();

function handleReplCommandTrust(
    workspaceUri: vscode.Uri,
    replCommand: string
): boolean {
    if (workspaceUri.scheme !== 'file') return false;
    const config = vscode.workspace.getConfiguration('ghcSimple', null);
    const insp = config.inspect('trustedReplCommandConfigs').globalValue ?? {};
    if (insp[workspaceUri.fsPath] === replCommand) {
        return true;
    } else {
        if (! alreadyShown.has(workspaceUri.fsPath)) {
            alreadyShown.add(workspaceUri.fsPath);
            vscode.window.showWarningMessage(
                `This workspace ${workspaceUri.fsPath} wants to run "${replCommand}" to start GHCi.\n\nAllow if you understand this and trust it.`,
                'Allow', 'Ignore'
            ).then((value) => {
                alreadyShown.delete(workspaceUri.fsPath);
                if (value == 'Allow') {
                    const trusted = config.get('trustedReplCommandConfigs');
                    trusted[workspaceUri.fsPath] = replCommand;
                    config.update('trustedReplCommandConfigs', trusted, vscode.ConfigurationTarget.Global);
                }
            })
        }
        return false;
    }
}

/** Configuration for a custom command */
async function customConfig(
    replScope: 'workspace' | 'file',
    replCommand: string,
    workspaceUri: vscode.Uri
): Promise<Configuration | null> {
    if (! handleReplCommandTrust(workspaceUri, replCommand))
        return null;

    if (replCommand.indexOf('$stack_ide_targets') !== -1) {
        const sit = await getStackIdeTargets(workspaceUri);
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

        const makeCabalConfig = (component: hie.CabalComponent): Configuration => ({
            key: {
                type: 'hie-bios-cabal',
                uri: workspace.uri.toString(),
                component: component.component
            },
            cwd: workspace.uri.fsPath,
            command: [ 'cabal', 'repl', component.component ],
            dependencies:  [
                ... config.dependencies || [],
                new vscode.RelativePattern(workspace, 'hie.yaml'),
                new vscode.RelativePattern(workspace, '*.cabal')
            ]
        });

        const makeCabalNullConfig = (): Configuration => ({
            key: {
                type: 'hie-bios-cabal-null',
                uri: workspace.uri.toString()
            },
            cwd: workspace.uri.fsPath,
            command: [ 'cabal', 'repl' ],
            dependencies:  [
                ... config.dependencies || [],
                new vscode.RelativePattern(workspace, 'stack.yaml'),
                new vscode.RelativePattern(workspace, 'hie.yaml'),
                new vscode.RelativePattern(workspace, '*.cabal')
            ]
        });

        const makeStackConfig = (
            component: hie.StackComponent,
            defaultStackYaml: string | null
        ): Configuration => {
            const stackYaml = component.stackYaml || defaultStackYaml;
            const stackYamlOpts = stackYaml ? [ '--stack-yaml', stackYaml ] : [];
            const componentOpts = component.component ? [ component.component ] : [];

            return {
                key: {
                    type: 'hie-bios-stack',
                    uri: workspace.uri.toString(),
                    component: component.component
                },
                cwd: workspace.uri.fsPath,
                command: [ 'stack', ...stackOptions, 'repl', '--no-load', ... stackYamlOpts, ... componentOpts ],
                dependencies:  [
                    ... config.dependencies || [],
                    stackYaml || new vscode.RelativePattern(workspace, 'stack.yaml'),
                    new vscode.RelativePattern(workspace, 'hie.yaml'),
                    new vscode.RelativePattern(workspace, '*.cabal'),
                    new vscode.RelativePattern(workspace, 'package.yaml')
                ]
            }
        };

        const makeStackNullConfig = (): Configuration => {
            return {
                key: {
                    type: 'hie-bios-stack-null',
                    uri: workspace.uri.toString()
                },
                cwd: workspace.uri.fsPath,
                command: [ 'stack', ...stackOptions, 'repl', '--no-load' ],
                dependencies:  [
                    ... config.dependencies || [],
                    new vscode.RelativePattern(workspace, 'hie.yaml'),
                    new vscode.RelativePattern(workspace, '*.cabal'),
                    new vscode.RelativePattern(workspace, 'package.yaml')
                ]
            }
        };

        const cradle = config.cradle;

        if ('cabal' in cradle) {
            const go = (components: hie.Multi<hie.CabalComponent>) => {
                const res = findMulti(components);
                if (res === null) {
                    return null;
                } else {
                    return makeCabalConfig(res);
                }
            };

            if (cradle.cabal === null) {
                return makeCabalNullConfig();
            } else if ('components' in cradle.cabal) {
                return go(cradle.cabal.components);
            } else if (Array.isArray(cradle.cabal)) {
                return go(cradle.cabal);
            } else {
                return makeCabalConfig(cradle.cabal);
            }
        } else if ('stack' in cradle) {
            const defaultStackYaml =
                (cradle.stack && 'stackYaml' in cradle.stack) ? cradle.stack.stackYaml : null;

            const go = (components: hie.Multi<hie.StackComponent>) => {
                const res = findMulti(components);
                if (res === null) {
                    return null;
                } else {
                    return makeStackConfig(res, defaultStackYaml);
                }
            };

            if (cradle.stack === null) {
                return makeStackNullConfig();
            } else if ('components' in cradle.stack) {
                return go(cradle.stack.components);
            } else if (Array.isArray(cradle.stack)) {
                return go(cradle.stack);
            } else {
                return makeStackConfig(cradle.stack, defaultStackYaml);
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
            new vscode.RelativePattern(workspace, 'package.yaml'),
            new vscode.RelativePattern(workspace, 'cabal.project'),
            new vscode.RelativePattern(workspace, 'cabal.project.local')
        ]
    });

    const makeStackConfig = (targets: string[]): Configuration => ({
        key: {
            type: 'detect-stack',
            uri: workspace.uri.toString(),
        },
        cwd: workspace.uri.fsPath,
        command: [ 'stack', ...stackOptions, 'repl', '--no-load', ... targets],
        dependencies:  [
            new vscode.RelativePattern(workspace, '*.cabal'),
            new vscode.RelativePattern(workspace, 'package.yaml'),
            new vscode.RelativePattern(workspace, 'stack.yaml')
        ]
    });

    if ((await find('dist-newstyle')).length > 0) {
        return makeCabalConfig();
    }

    if ((await find('.stack-work')).length > 0
        || (await find('stack.yaml')).length > 0) {
        try {
            const targets = await getStackIdeTargets(workspace.uri);
            return makeStackConfig(targets);
        } catch (e) {
            console.error('Error detecting stack configuration:', e);
            console.log('Trying others...');
        }
    }

    if ((await find('*.cabal')).length > 0
        || (await find('cabal.project')).length > 0
        || (await find('cabal.project.local')).length > 0) {
        return makeCabalConfig();
    }

    return singleConfig();
}
