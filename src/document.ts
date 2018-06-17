import * as vscode from 'vscode';
import { Disposable, Range, Selection, Position } from 'vscode';
import { GhciManager } from './ghci';
import { ExtensionState, HaskellWorkspaceType } from './extension-state';


export class DocumentManager implements Disposable {
    ghci: GhciManager;
    path: string;
    typeCache: null | string[];
    starting: Thenable<void>;
    loading: Thenable<void>;
    ext: ExtensionState;

    makeGhci(ghciCommand: string[]) {
        this.ghci = new GhciManager(
            ghciCommand[0],
            ghciCommand.slice(1),
            { cwd: vscode.workspace.rootPath, stdio: 'pipe' },
            this.ext);
    }

    constructor(path_: string, ext: ExtensionState) {
        this.path = path_;
        this.ghci = null;
        this.ext = ext
        this.starting = this.start();
    }

    async start(): Promise<void> {
        const wst = await this.ext.workspaceType;
        const cmdTable: { [k in HaskellWorkspaceType]: string[] } = {
            'stack': ['stack', 'repl'],
            'cabal': ['cabal', 'repl'],
            'bare-stack': ['stack', 'exec', 'ghci'],
            'bare': ['ghci'],
        };
        this.makeGhci(cmdTable[wst]);
        const configure = ':set -fno-diagnostics-show-caret -fdiagnostics-color=never -ferror-spans -fdefer-type-errors -Wall';
        return this.ghci.sendCommand(configure).then(() => {});
    }

    clear() {
        this.typeCache = null;
    }

    dispose() {
        this.ghci.dispose();
    }

    async loadP(): Promise<string[]> {
        await this.starting;
        return await this.ghci.sendCommand([':set +c', ':l ' + this.path]);
    }

    reload(): Promise<string[]> {
        this.clear();
        const pr = this.loadP();
        this.loading = pr.then(() => undefined);
        return pr;
    }

    async getType(sel: Selection | Position | Range): Promise<null | [Range, string]> {
        let selRangeOrPos: Range | Position;
        if (sel instanceof Selection) {
            selRangeOrPos = new Range(sel.start, sel.end);
        } else {
            selRangeOrPos = sel;
        }
        // this.typeCache = [];

        await this.loading;

        const typesB: string[] =
            this.typeCache === null
                ? await this.ghci.sendCommand(':all-types')
                : this.typeCache;

        this.typeCache = typesB;

        const strTypes = typesB.filter((x) => x.startsWith(this.path));
        const allTypes = strTypes.map((x) =>
            /^:\((\d+),(\d+)\)-\((\d+),(\d+)\): (.*)$/.exec(x.substr(this.path.length)));

        let curBestRange: null | Range = null, curType: null | string = null;

        for (let [_whatever, startLine, startCol, endLine, endCol, type] of allTypes) {
            const curRange = new Range(+startLine - 1, +startCol - 1, +endLine - 1, +endCol - 1);
            if (curRange.contains(selRangeOrPos)) {
                if (curBestRange === null || curBestRange.contains(curRange)) {
                    curBestRange = curRange;
                    curType = type;
                }
            }
        }

        if (curType === null) {
            return null;
        } else {
            const re = /[A-Za-z0-9_']*/g
            const typeVariables = curType.match(re).filter((u) =>
                u.length && u !== 'forall' && /[a-z]/.test(u[0]));
            const forallPart = `forall ${[...new Set(typeVariables)].join(' ')}.`
            const fullType = `${forallPart} ${curType}`;
            const res = await this.ghci.sendCommand([
                ':set -XExplicitForAll',
                `:kind! ${fullType}`]);

            const resolved: null | string = (() => {
                while (res.length && ! res[0].startsWith(`${fullType} ::`)) res.shift();
                if (res.length && res[1].startsWith('= ')) {
                    res.shift();
                    res[0] = res[0].slice(1); // Skip '=' on second line
                    return res.join(' ').replace(/\s{2,}/g, ' ');
                } else {
                    return null;
                }
            })();

            if (resolved) {
                return [curBestRange, resolved];
            } else {
                return [curBestRange, curType.replace(/([A-Za-z0-9_']+\.)+/g, '')];
            }
        }
    }
}