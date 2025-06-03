// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {
  window,
  workspace,
  Position,
  Selection,
  commands,
  ExtensionContext,
  TextEditor,
  languages,
  CodeActionProvider,
  CodeActionKind,
  CodeActionContext,
  CodeAction,
  Range,
  CancellationToken,
  WorkspaceEdit,
  TextDocument,
} from "vscode";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log(
    'Congratulations, your extension "toggle-quotes-plus" is now active!'
  );

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const disposable = commands.registerCommand(
    "toggle-quotes-plus.toggleQuotes",
    () => {
      // The code you place here will be executed every time your command is executed
      toggle();
    }
  );

  context.subscriptions.push(disposable);

  const codeActionsDisposable = languages.registerCodeActionsProvider(
    "*", // 适用所有语言，可改为特定语言如 'typescript'
    new MyCodeActionProvider(),
    {
      providedCodeActionKinds: MyCodeActionProvider.providedCodeActionKinds,
    }
  );
  context.subscriptions.push(codeActionsDisposable);
}

export class MyCodeActionProvider implements CodeActionProvider {
  public static readonly providedCodeActionKinds = [CodeActionKind.QuickFix];

  provideCodeActions(
    document: TextDocument,
    range: Range | Selection,
    context: CodeActionContext,
    token: CancellationToken
  ): CodeAction[] | Thenable<CodeAction[]> | undefined {
    var editor = window.activeTextEditor;
    if (!editor) return;
    for (const sel of editor.selections) {
      const content = editor.document.lineAt(sel.start.line);
      const charInfo = findChar(getChars(editor), content.text, sel);
      if (charInfo) {
        const maybeChars = workspace
          .getConfiguration("toggleQuotesPlus", editor.document)
          .get("chars");
        const chars = Array.isArray(maybeChars) ? maybeChars : [];
        return chars.map((char: string) =>
          this.createFix(document, range, char)
        );
      }
    }
  }

  private createFix(
    document: TextDocument,
    range: Range,
    symbol: string
  ): CodeAction {
    let leftChar = symbol[0];
    let rightChar = symbol[2] ?? leftChar; // if no right char, use the same as left
    const fix = new CodeAction(
      `Change to ${leftChar}...${rightChar}`,
      CodeActionKind.QuickFix
    );
    fix.edit = new WorkspaceEdit();
    if (fix.edit) {
      let editor = window.activeTextEditor;
      if (!editor) return fix;
      toggle({ begin: leftChar, end: rightChar }, fix);
    }
    return fix;
  }
}

type Quotes = { begin: string; end: string };

function toggle(): void;
function toggle(nextChar: Quotes, fix: CodeAction): void;
// Implementation
function toggle(nextChar?: Quotes, fix?: CodeAction) {
  let editor = window.activeTextEditor;
  if (!editor) return;
  let doc = editor.document;
  let chars = [];

  try {
    chars = getChars(editor);
  } catch (e) {
    if (e instanceof Error) {
      window.showErrorMessage(e.message);
    } else {
      window.showErrorMessage("An unknown error occurred.");
    }
    return;
  }

  const changes: { char: string; selection: Selection }[] = [];
  for (const sel of editor.selections) {
    const content = doc.lineAt(sel.start.line);
    const charInfo = findChar(chars, content.text, sel);

    if (charInfo) {
      const foundCharIdx = chars.indexOf(charInfo.foundQuotes);
      nextChar = nextChar ?? chars[(foundCharIdx + 1) % chars.length];
      const first = new Position(sel.start.line, charInfo.start);
      const firstSelection = new Selection(
        first,
        new Position(first.line, first.character + 1)
      );
      changes.push({ char: nextChar.begin, selection: firstSelection });

      const second = new Position(sel.start.line, charInfo.end);
      const secondSelection = new Selection(
        second,
        new Position(second.line, second.character + 1)
      );
      changes.push({ char: nextChar.end, selection: secondSelection });
    }
  }

  editor.edit((edit) => {
    for (const change of changes) {
      if (fix) {
        fix.edit?.replace(doc.uri, change.selection, change.char);
      } else {
        edit.replace(change.selection, change.char);
      }
    }
  });
}

/** Find the .start and .end of a char (from the chars list) or null if any side is not found */
function findChar(
  chars: Quotes[],
  txt: string,
  sel: Selection
): { start: number; end: number; foundQuotes: Quotes } | null {
  let start: number = -1;
  let end: number = -1;
  let foundQuotes: Quotes | undefined;

  // find the index of next char from end selection
  for (let i = sel.end.character; i < txt.length; i++) {
    const c = txt[i];
    const beforeC = i > 0 ? txt[i - 1] : null; // the previous character (to see if it is '\')
    if (beforeC !== "\\") {
      foundQuotes = chars.find((quotes) => quotes.end === c);
      if (foundQuotes) {
        end = i;
        break;
      }
    }
  }

  // find the index of previous char (note at this point we should have the found char)
  for (let i = sel.start.character - 1; i > -1; i--) {
    const c = txt[i];
    const beforeC = i > 0 ? txt[i - 1] : null; // the previous character (to see if it is '\')
    if (beforeC !== "\\") {
      if (foundQuotes?.begin === c) {
        start = i;
        break;
      }
    }
  }

  if (start > -1 && end > -1 && foundQuotes) {
    return { start, end, foundQuotes };
  } else {
    return null;
  }
}

function getChars(editor: TextEditor): Quotes[] {
  const maybeChars = workspace
    .getConfiguration("toggleQuotesPlus", editor.document)
    .get("chars");
  const chars = Array.isArray(maybeChars) ? maybeChars : [];

  return chars.map((char: any) => {
    if (typeof char === "string") {
      if (char.length === 1) {
        return { begin: char, end: char };
      } else {
        const match = char.match(/^(.),(.)$/);
        if (match) {
          return { begin: match[1], end: match[2] };
        } else {
          throw Error("Wrong togglequotesPlus.chars array quotes pair format.");
        }
      }
    } else {
      throw Error("Wrong togglequotesPlus.chars array quotes pair format.");
    }
  });
}

// This method is called when your extension is deactivated
export function deactivate() {}
