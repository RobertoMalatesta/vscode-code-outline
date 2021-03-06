import { Event, EventEmitter, ExtensionContext, SymbolKind, SymbolInformation, TextDocument, TextEditor, TreeDataProvider, TreeItem, TreeItemCollapsibleState, commands, window } from 'vscode';
import * as path from 'path';

export class SymbolNode {
    symbol: SymbolInformation;
    children?: SymbolNode[];

    constructor(symbol?: SymbolInformation) {
        this.children = [];
        this.symbol = symbol;
    }

    private getKindOrder(kind: SymbolKind): number {
        switch (kind) {
            case SymbolKind.Constructor:
            case SymbolKind.Function:
            case SymbolKind.Method:
                return 3;
            case SymbolKind.Class:
                return 2;
            case SymbolKind.Interface:
                return 1;
            case SymbolKind.Constant:
                return -1;
            case SymbolKind.Module:
                return -2;
            default:
                return 0;
        };
    }

    private compareSymbols(a: SymbolNode, b: SymbolNode): number {
        const kindOrder = this.getKindOrder(a.symbol.kind) - this.getKindOrder(b.symbol.kind);
        if (kindOrder !== 0) {
            return kindOrder;
        }
        if (a.symbol.name.toLowerCase() > b.symbol.name.toLowerCase()) {
            return 1;
        }
        return -1;
    }

    sort() {
        this.children.sort(this.compareSymbols.bind(this));
        this.children.forEach((child) => child.sort());
    }

    addChild(child: SymbolNode) {
        this.children.push(child);
    }
}

export class SymbolOutlineProvider implements TreeDataProvider<SymbolNode> {
    private _onDidChangeTreeData: EventEmitter<SymbolNode | null> = new EventEmitter<SymbolNode | null>();
    readonly onDidChangeTreeData: Event<SymbolNode | null> = this._onDidChangeTreeData.event;

    private context: ExtensionContext;
    private tree: SymbolNode;

    private getSymbols(document: TextDocument): Thenable<SymbolInformation[]> {
        return commands.executeCommand<SymbolInformation[]>('vscode.executeDocumentSymbolProvider', document.uri);
    }

    private async updateSymbols(editor: TextEditor): Promise<void> {
        const tree = new SymbolNode();
        if (editor) {
            const symbols = await this.getSymbols(editor.document);
            symbols.reduce((knownContainerScopes, symbol) => {
                let parent: SymbolNode;
                const node = new SymbolNode(symbol);
                if (!(symbol.containerName in knownContainerScopes)) {
                    return knownContainerScopes;
                }
                parent = knownContainerScopes[symbol.containerName];
                parent.addChild(node);
                return {...knownContainerScopes, [symbol.name]: node};
            }, {'': tree});
        }
        tree.sort();
        this.tree = tree;
        this._onDidChangeTreeData.fire();
    }


    constructor(context: ExtensionContext) {
        this.context = context;
		window.onDidChangeActiveTextEditor((editor) => {
            this.updateSymbols(editor);
		});
	}

    async getChildren(node?: SymbolNode): Promise<SymbolNode[]> {
		if (node) {
			return node.children;
		} else {
            if (!this.tree) {
                await this.updateSymbols(window.activeTextEditor);
            }
			return this.tree.children;
		}
	}

    private getIcon(kind: SymbolKind): string {
        let icon: string;
        switch (kind) {
            case SymbolKind.Class:
                icon = 'icon-class.svg';
                break;
            case SymbolKind.Constructor:
            case SymbolKind.Function:
            case SymbolKind.Method:
                icon = 'icon-function.svg';
                break;
            case SymbolKind.Module:
                icon = 'icon-module.svg';
                break;
            case SymbolKind.Property:
                icon = 'icon-property.svg';
                break;
            default:
                icon = 'icon-variable.svg';
                break;
        };
        return this.context.asAbsolutePath(path.join('resources', icon));
    }

    getTreeItem(node: SymbolNode): TreeItem {
        const { kind } = node.symbol;
		let treeItem = new TreeItem(node.symbol.name);
        treeItem.collapsibleState = node.children.length ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None;
        treeItem.command = {
			command: 'revealLine',
			title: '',
			arguments: [{lineNumber: node.symbol.location.range.start.line, at: 'center'}]
		};
        treeItem.iconPath = this.getIcon(kind);
		return treeItem;
	}
}