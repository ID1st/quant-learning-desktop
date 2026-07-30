import { create } from "zustand";
import type {
  StrategyParameterDefinition,
  UserStrategyDraftDefinition,
} from "@quant/strategy-engine";
import { appLocalDatabase } from "../persistence/localDatabase";

const COLLECTION_KEY = "user-strategy-drafts";
const STORAGE_VERSION = 1;

export interface ImportedStrategyDraft {
  id: string;
  definition: UserStrategyDraftDefinition;
  createdAt: string;
}

interface StoredUserStrategyDraftState {
  version: number;
  drafts: ImportedStrategyDraft[];
  selectedDraftId: string | null;
}

interface UserStrategyDraftState {
  drafts: ImportedStrategyDraft[];
  selectedDraftId: string | null;
  addDraft: (definition: UserStrategyDraftDefinition) => string;
  duplicateDraft: (draftId: string) => string | null;
  updateDraftMeta: (draftId: string, values: { name: string; description: string }) => void;
  updateDraftParameter: (
    draftId: string,
    parameterKey: string,
    defaultValue: StrategyParameterDefinition["defaultValue"],
  ) => void;
  deleteDraft: (draftId: string) => void;
  setSelectedDraftId: (draftId: string | null) => void;
}

function isStoredDraft(value: unknown): value is ImportedStrategyDraft {
  if (!value || typeof value !== "object") {
    return false;
  }

  const draft = value as Partial<ImportedStrategyDraft>;
  return (
    typeof draft.id === "string" &&
    typeof draft.createdAt === "string" &&
    !!draft.definition &&
    typeof draft.definition === "object" &&
    typeof draft.definition.key === "string" &&
    typeof draft.definition.name === "string" &&
    typeof draft.definition.sourceFile === "string" &&
    !!draft.definition.translation
  );
}

function readStoredDraftState(): StoredUserStrategyDraftState {
  return appLocalDatabase.readDocument(COLLECTION_KEY, {
    version: STORAGE_VERSION,
    fallback: { version: STORAGE_VERSION, drafts: [], selectedDraftId: null },
    sanitize: sanitizeDraftState,
  });
}

function writeStoredDraftState(state: Pick<UserStrategyDraftState, "drafts" | "selectedDraftId">) {
  appLocalDatabase.writeDocument(COLLECTION_KEY, STORAGE_VERSION, {
    version: STORAGE_VERSION,
    drafts: state.drafts,
    selectedDraftId: state.selectedDraftId,
  });
}

function sanitizeDraftState(value: unknown): StoredUserStrategyDraftState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const parsed = value as Partial<StoredUserStrategyDraftState>;
  const drafts = Array.isArray(parsed.drafts) ? parsed.drafts.filter(isStoredDraft) : [];
  const selectedDraftId =
    typeof parsed.selectedDraftId === "string" &&
    drafts.some((draft) => draft.id === parsed.selectedDraftId)
      ? parsed.selectedDraftId
      : null;

  return { version: STORAGE_VERSION, drafts, selectedDraftId };
}

function createDraftId(key: string, drafts: ImportedStrategyDraft[]) {
  let index = drafts.length + 1;
  let draftId = `${key}-${index}`;

  while (drafts.some((draft) => draft.id === draftId)) {
    index += 1;
    draftId = `${key}-${index}`;
  }

  return draftId;
}

function createCopyName(name: string, drafts: ImportedStrategyDraft[]) {
  const baseName = `${name} 副本`;
  let index = 1;
  let copyName = baseName;

  while (drafts.some((draft) => draft.definition.name === copyName)) {
    index += 1;
    copyName = `${baseName} ${index}`;
  }

  return copyName;
}

const storedState = readStoredDraftState();

export const useUserStrategyDraftStore = create<UserStrategyDraftState>((set) => ({
  drafts: storedState.drafts,
  selectedDraftId: storedState.selectedDraftId,
  addDraft: (definition) => {
    let createdDraftId = "";

    set((state) => {
      createdDraftId = createDraftId(definition.key, state.drafts);
      const nextState = {
        drafts: [
          ...state.drafts,
          {
            id: createdDraftId,
            definition,
            createdAt: new Date().toISOString(),
          },
        ],
        selectedDraftId: createdDraftId,
      };

      writeStoredDraftState(nextState);
      return nextState;
    });

    return createdDraftId;
  },
  duplicateDraft: (draftId) => {
    let createdDraftId: string | null = null;

    set((state) => {
      const sourceDraft = state.drafts.find((draft) => draft.id === draftId);
      if (!sourceDraft) {
        return state;
      }

      createdDraftId = createDraftId(sourceDraft.definition.key, state.drafts);
      const copiedDraft: ImportedStrategyDraft = {
        id: createdDraftId,
        createdAt: new Date().toISOString(),
        definition: {
          ...sourceDraft.definition,
          name: createCopyName(sourceDraft.definition.name, state.drafts),
          description: sourceDraft.definition.description,
          parameterSchema: sourceDraft.definition.parameterSchema.map((parameter) => ({
            ...parameter,
          })),
          translation: {
            ...sourceDraft.definition.translation,
            ir: {
              ...sourceDraft.definition.translation.ir,
              declaration: { ...sourceDraft.definition.translation.ir.declaration },
              inputs: sourceDraft.definition.translation.ir.inputs.map((input) => ({ ...input })),
              visuals: sourceDraft.definition.translation.ir.visuals.map((visual) => ({
                ...visual,
              })),
              alerts: sourceDraft.definition.translation.ir.alerts.map((alert) => ({ ...alert })),
              unsupportedCalls: [...sourceDraft.definition.translation.ir.unsupportedCalls],
            },
            reasons: [...sourceDraft.definition.translation.reasons],
          },
        },
      };
      const nextState = {
        drafts: [...state.drafts, copiedDraft],
        selectedDraftId: createdDraftId,
      };

      writeStoredDraftState(nextState);
      return nextState;
    });

    return createdDraftId;
  },
  updateDraftMeta: (draftId, values) => {
    const name = values.name.trim();
    const description = values.description.trim();

    if (!name) {
      return;
    }

    set((state) => {
      const nextState = {
        drafts: state.drafts.map((draft) =>
          draft.id === draftId
            ? {
                ...draft,
                definition: {
                  ...draft.definition,
                  name,
                  description,
                },
              }
            : draft,
        ),
        selectedDraftId: state.selectedDraftId,
      };

      writeStoredDraftState(nextState);
      return nextState;
    });
  },
  updateDraftParameter: (draftId, parameterKey, defaultValue) => {
    set((state) => {
      const nextState = {
        drafts: state.drafts.map((draft) =>
          draft.id === draftId
            ? {
                ...draft,
                definition: {
                  ...draft.definition,
                  parameterSchema: draft.definition.parameterSchema.map((parameter) =>
                    parameter.key === parameterKey ? { ...parameter, defaultValue } : parameter,
                  ),
                },
              }
            : draft,
        ),
        selectedDraftId: state.selectedDraftId,
      };

      writeStoredDraftState(nextState);
      return nextState;
    });
  },
  deleteDraft: (draftId) => {
    set((state) => {
      const drafts = state.drafts.filter((draft) => draft.id !== draftId);
      const selectedDraftId =
        state.selectedDraftId === draftId ? (drafts[0]?.id ?? null) : state.selectedDraftId;
      const nextState = { drafts, selectedDraftId };

      writeStoredDraftState(nextState);
      return nextState;
    });
  },
  setSelectedDraftId: (selectedDraftId) => {
    set((state) => {
      const nextSelectedDraftId =
        selectedDraftId && state.drafts.some((draft) => draft.id === selectedDraftId)
          ? selectedDraftId
          : null;
      const nextState = { drafts: state.drafts, selectedDraftId: nextSelectedDraftId };

      writeStoredDraftState(nextState);
      return { selectedDraftId: nextSelectedDraftId };
    });
  },
}));
