import { createTypedEventEmitter } from "src/api/util";

export enum NotificationEvents {
  Notify = "Notify"
}

export type ItemNotificationType = {
  type: "item";
  itemType: string;
  itemVariant?: string;
  itemName?: string;
  count?: number;
};

export type CurrencyNotificationType = {
  type: "currency";
  count: number;
};

export type CodingChallengeNotificationType = {
  type: "challenge";
};

export type NotificationType =
  | ItemNotificationType
  | CurrencyNotificationType
  | CodingChallengeNotificationType;

export type NotificationEventTypes = {
  [NotificationEvents.Notify]: NotificationType;
};

export const notificationEvents =
  createTypedEventEmitter<NotificationEventTypes>();
