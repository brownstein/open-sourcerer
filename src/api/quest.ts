export type QuestStep = {
  name: string;
  complete?: boolean;
};

export type Quest = {
  name: string;
  complete?: boolean;
  steps: QuestStep[];
};
