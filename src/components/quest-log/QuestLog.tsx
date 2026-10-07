import cx from "classnames";
import { useTranslation } from "react-i18next";

import { useAppSelector } from "src/redux/hooks";
import {
  selectOpenQuests,
  selectProgressionHistory
} from "src/redux/progression/selectors";

import { Icon } from "../ui/icons/Icon";
import "./QuestLog.css";

export function QuestLogTab() {
  const { t } = useTranslation();
  const history = useAppSelector(selectProgressionHistory);
  const openQuests = useAppSelector(selectOpenQuests);

  return (
    <div className="quest-log-container">
      <div className="quest-log-content">
        <h3>{t("questLog.title")}</h3>
        <div className="quest-log-subcontent">
          <h4>Completed Quests, Tutorials, and Challenges</h4>
          <ul className="completed">
            {history
              .filter((h) => h.type === "quest")
              .map((h, i) => (
                <li
                  className={cx(
                    "completed-history-item",
                    `completed-${h.type}`
                  )}
                  key={i}
                >
                  <Icon icon="check" className="status-icon" />
                  <h5>{h.name}</h5>
                </li>
              ))}
          </ul>
        </div>
        <div className="quest-log-subcontent">
          <h4>Active Quests</h4>
          <ul className="quests">
            {openQuests.map((q, i) => (
              <li
                key={i}
                className={cx("quest", {
                  complste: q.complete
                })}
              >
                <div className="icon-and-title">
                  <Icon icon="wizardHat" className="status-icon" />
                  <h5 className="quest-name">{q.name}</h5>
                </div>
                <ul className="quest-line-items">
                  {q.steps.map((s, si) => (
                    <li
                      key={si}
                      className={cx("quest-line-item", {
                        complete: s.complete
                      })}
                    >
                      {s.name}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
