import { create } from "zustand";
import type { UserStrategyDraftDefinition } from "@quant/strategy-engine";

const STORAGE_KEY = "quant-learning.user-strategy-drafts";
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
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) {
      return { version: STORAGE_VERSION, drafts: [], selectedDraftId: null };
    }

    const parsed = JSON.parse(value) as Partial<StoredUserStrategyDraftState>;
    const drafts = Array.isArray(parsed.drafts) ? parsed.drafts.filter(isStoredDraft) : [];
    const selectedDraftId =
      typeof parsed.selectedDraftId === "string" && drafts.some((draft) => draft.id === parsed.selectedDraftId)
        ? parsed.selectedDraftId
        : null;

    return { version: STORAGE_VERSION, drafts, selectedDraftId };
  } catch {
    return { version: STORAGE_VERSION, drafts: [], selectedDraftId: null };
  }
}

function writeStoredDraftState(state: Pick<UserStrategyDraftState, "drafts" | "selectedDraftId">) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: STORAGE_VERSION,
      drafts: state.drafts,
      selectedDraftId: state.selectedDraftId,
    }),
  );
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
  deleteDraft: (draftId) => {
    set((state) => {
      const drafts = state.drafts.filter((draft) => draft.id !== draftId);
      const selectedDraftId = state.selectedDraftId === draftId ? drafts[0]?.id ?? null : state.selectedDraftId;
      const nextState = { drafts, selectedDraftId };

      writeStoredDraftState(nextState);
      return nextState;
    });
  },
  setSelectedDraftId: (selectedDraftId) => {
    set((state) => {
      const nextSelectedDraftId = selectedDraftId && state.drafts.some((draft) => draft.id === selectedDraftId) ? selectedDraftId : null;
      const nextState = { drafts: state.drafts, selectedDraftId: nextSelectedDraftId };

      writeStoredDraftState(nextState);
      return { selectedDraftId: nextSelectedDraftId };
    });
  },
}));
