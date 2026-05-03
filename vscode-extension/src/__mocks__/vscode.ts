/**
 * Minimal VS Code API mock for Jest tests.
 * Provides the subset of vscode.* that extension.ts and planView.ts use.
 */

const commands = {
  registerCommand: jest.fn(),
  executeCommand: jest.fn(),
};

const window = {
  createOutputChannel: jest.fn(() => ({
    appendLine: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn(),
  })),
  registerWebviewViewProvider: jest.fn(),
  showInformationMessage: jest.fn(),
  showWarningMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  showOpenDialog: jest.fn(),
};

const workspace = {
  workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }],
  getConfiguration: jest.fn(() => ({
    get: jest.fn((key: string) => {
      if (key === 'manifestPath') return 'design/manifest.yaml';
      if (key === 'defaultBranch') return '';
      return undefined;
    }),
  })),
};

class Uri {
  static file(p: string) { return { fsPath: p, scheme: 'file' }; }
  static joinPath(base: any, ...segments: string[]) {
    return { fsPath: [base.fsPath, ...segments].join('/') };
  }
}

export { commands, window, workspace, Uri };
