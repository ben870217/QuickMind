import { createQuickMindDocument, type QuickMindDocument } from '../domain/document';
import type { WorkspaceStore } from '../persistence/workspace-store';

export type PersistenceStatus = 'saving' | 'saved' | 'error';
export type ConnectivityStatus = 'online' | 'offline';

export interface WorkspaceState {
  document: QuickMindDocument;
  persistence: PersistenceStatus;
  connectivity: ConnectivityStatus;
  restored: boolean;
}

export interface DocumentWorkflowOptions {
  createDocument?: () => QuickMindDocument;
  initialConnectivity?: ConnectivityStatus;
}

export class DocumentWorkflow {
  private state: WorkspaceState | null = null;
  private readonly createDocument: () => QuickMindDocument;
  private readonly initialConnectivity: ConnectivityStatus;

  constructor(
    private readonly store: WorkspaceStore,
    options: DocumentWorkflowOptions = {},
  ) {
    this.createDocument = options.createDocument ?? (() => createQuickMindDocument());
    this.initialConnectivity = options.initialConnectivity ?? 'online';
  }

  async start(): Promise<WorkspaceState> {
    const savedDocument = await this.store.load();

    if (savedDocument) {
      this.state = {
        document: savedDocument,
        persistence: 'saved',
        connectivity: this.initialConnectivity,
        restored: true,
      };

      return this.getState();
    }

    const document = this.createDocument();
    this.state = {
      document,
      persistence: 'saving',
      connectivity: this.initialConnectivity,
      restored: false,
    };

    try {
      await this.store.save(document);
      this.state.persistence = 'saved';
    } catch {
      this.state.persistence = 'error';
    }

    return this.getState();
  }

  setConnectivity(connectivity: ConnectivityStatus): WorkspaceState {
    this.requireState().connectivity = connectivity;

    return this.getState();
  }

  getState(): WorkspaceState {
    const state = this.requireState();

    return {
      ...state,
      document: structuredClone(state.document),
    };
  }

  private requireState(): WorkspaceState {
    if (!this.state) {
      throw new Error('Document workflow has not started');
    }

    return this.state;
  }
}
