/**
 * Hand-rolled VS Code API mock for Jest.
 * Only the surface area used by extension.ts and planView.ts is implemented.
 */

const outputChannelMock = {
  appendLine: jest.fn(),
  show:       jest.fn(),
  dispose:    jest.fn(),
};

const window = {
  createOutputChannel:    jest.fn(() => outputChannelMock),
  showWarningMessage:     jest.fn().mockResolvedValue(undefined),
  showInformationMessage: jest.fn().mockResolvedValue(undefined),
  showErrorMessage:       jest.fn().mockResolvedValue(undefined),
  showOpenDialog:         jest.fn().mockResolvedValue(undefined),
  registerWebviewViewProvider: jest.fn(),
};

const commands = {
  registerCommand: jest.fn((_id: string, handler: () => void) => ({ dispose: jest.fn() })),
  executeCommand:  jest.fn().mockResolvedValue(undefined),
};

const workspace = {
  workspaceFolders: [{ uri: { fsPath: '/test/repo' } }],
  getConfiguration: jest.fn(() => ({
    get: jest.fn((key: string) => {
      if (key === 'manifestPath')  { return 'design/manifest.yaml'; }
      if (key === 'defaultBranch') { return ''; }
      if (key === 'useGlobalCli')  { return false; }
      return undefined;
    }),
  })),
};

const Uri = {
  file: jest.fn((p: string) => ({ fsPath: p, toString: () => `file://${p}` })),
};

// ── exports ────────────────────────────────────────────────────────────────────
export { window, commands, workspace, Uri };
export default { window, commands, workspace, Uri };

// Named re-exports expected by the extension
export const __outputChannelMock = outputChannelMock;
