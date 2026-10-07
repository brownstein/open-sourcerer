import { TFunction } from "i18next";
import { ReactNode } from "react";

// An array renders a line at a time, a function builds rich content in code.
// Only the string forms survive a level file.
export type ConversationText =
  | string
  | string[]
  | ((t: TFunction) => ReactNode);

export type Conversation<
  Speaker extends string = string,
  Step extends string = string
> = {
  speakers?: Speaker[];
  speakerImages?: Record<string, string>;
  speakerImageClassNames?: Record<string, string>;
  start: Step;
  steps: Record<
    Step,
    {
      speaker: Speaker;
      speakerImage?: string;
      text: ConversationText;
      onStart?: () => void;
      next?: Step;
      nextOptions?: {
        text: ConversationText;
        next: Step;
      }[];
      done?: boolean;
    }
  >;
  onComplete?: (lastStep: Step) => void;
};

export function makeConversation<Speaker extends string, Step extends string>(
  convo: Conversation<Speaker, Step>
) {
  return convo;
}
