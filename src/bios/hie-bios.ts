import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as yaml from 'js-yaml';

export type HasPath = { path: string };
export type Multi<A> = (A & HasPath)[];

export interface CabalComponent {
    component: string;
}

export type Cabal =
    null
    | CabalComponent
    | Multi<CabalComponent>
    | { components: Multi<CabalComponent> };

export interface StackComponent {
    component?: string;
    stackYaml?: string;
}

export type Stack =
    null
    | StackComponent
    | Multi<StackComponent>
    | {
        stackYaml?: string,
        components: Multi<StackComponent>
    };

export interface Bios {
    program: string,
    'dependency-program'?: string
}

export interface Direct {
    arguments: string[]
}

export type None = null;

export type Cradle =
    { cabal: Cabal }
    | { stack: Stack }
    | { bios: Bios }
    | { direct: Direct }
    | { multi: Multi<{ config: HieConfig }> }
    | { none: None };


export interface HieConfig {
    cradle: Cradle;
    dependencies: string[];
}

export async function getCradleConfig(
    workspaceUri: vscode.Uri
): Promise<HieConfig> {
    const hieYamlPath = path.join(workspaceUri.fsPath, 'hie.yaml');
    const contents = await new Promise<string>((resolve, reject) => {
        fs.readFile(hieYamlPath, 'utf-8', (err, data) => {
            if (err) reject(err);
            else resolve(data);
        })
    });
    return yaml.load(contents) as HieConfig;
}
