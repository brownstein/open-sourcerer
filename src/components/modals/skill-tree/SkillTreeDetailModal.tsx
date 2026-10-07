import { UIEvent, useCallback, useEffect, useRef, useState } from "react";

import { ModalComponentPropsType, ModalDefinitionType } from "src/api/modal";
import { savedSpellToItemData } from "src/api/spells";
import { DocsEntry } from "src/components/docs/DocsEntry/DocsEntry";
import { BaseModal } from "src/components/modals/BaseModal";
import { FALLBACK_LOCALE } from "src/docs/configuration";
import { LocaleCode } from "src/docs/indexedDocs/docTypes";
import { useAppDispatch, useAppSelector } from "src/redux/hooks";
import { setDocsViewedPercentage } from "src/redux/progression/slice";
import { addItems } from "src/redux/shared/actions";
import { selectLearnedSkillsMap } from "src/redux/skillTree/selectors";
import { learnSkill } from "src/redux/skillTree/slice";
import { closeCurrentModal } from "src/redux/ui/slice";
import { builtInSpells } from "src/scripting/builtinScripts";

import "./SkillTreeDetailModal.css";

// DocsEntry drives in-page search navigation through these handlers; the modal
// has no search UI, so it hands it no-ops.
const noop = () => {};

export type SkillTreeDetailModalProps =
  ModalComponentPropsType<"skillTreeDetail">;

export function SkillTreeDetailModal(props: SkillTreeDetailModalProps) {
  const { opening, closing, modalArg } = props;
  const { skillId, skillName, skillDescription, docsLink, learnable } =
    modalArg;
  const { unlocksPreset } = modalArg;
  const dispatch = useAppDispatch();
  const learnedSkills = useAppSelector(selectLearnedSkillsMap);
  const learned = !!learnedSkills[skillId];
  const locale = useAppSelector(
    (state) => (state.settings.language || FALLBACK_LOCALE) as LocaleCode
  );

  // A docs-backed skill can only be learned once the player has read to the end
  // of its documentation. Once satisfied it stays satisfied (never reset).
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const docsScrollRef = useRef<HTMLDivElement>(null);

  const checkScrolledToEnd = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    if (atEnd) setScrolledToEnd(true);
  }, []);

  // Measure after layout: docs short enough to fit without scrolling count as
  // already read. Re-measure on resize / late content (e.g. a banner image
  // loading in) so a doc that fits doesn't stay falsely gated.
  useEffect(() => {
    if (!docsLink) return;
    const el = docsScrollRef.current;
    if (!el) return;
    checkScrolledToEnd(el);
    const observer = new ResizeObserver(() => checkScrolledToEnd(el));
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [docsLink, checkScrolledToEnd]);

  const handleScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => checkScrolledToEnd(e.currentTarget),
    [checkScrolledToEnd]
  );

  const handleLearn = useCallback(() => {
    dispatch(learnSkill({ skillID: skillId }));
    // Mark the doc as viewed.
    if (docsLink !== undefined) {
      dispatch(setDocsViewedPercentage([docsLink, 1]));
    }
    // Learning a preset-bearing skill also grants its built-in spell.
    const preset = unlocksPreset && builtInSpells[unlocksPreset];
    if (preset) {
      dispatch(
        addItems({
          item: savedSpellToItemData(preset),
          hotkey: true,
          ignoreIfPresent: true
        })
      );
    }
    dispatch(closeCurrentModal());
  }, [dispatch, skillId, unlocksPreset]);

  // Eligible to learn only when a prerequisite is met (core skill or adjacent
  // to a learned one) and, for docs-backed skills, the doc has been read.
  const docRead = !docsLink || scrolledToEnd;
  const canLearn = learnable && docRead;
  const learnHint = !learnable
    ? "Learn a connected skill first."
    : !docRead
      ? "Read to the end to learn this skill."
      : undefined;

  return (
    <BaseModal
      title={skillName}
      size="medium"
      opening={opening}
      closing={closing}
    >
      <div className="skill-tree-detail-modal">
        {docsLink ? (
          <div
            className="skill-tree-detail-docs"
            ref={docsScrollRef}
            onScroll={handleScroll}
          >
            <DocsEntry
              docId={docsLink}
              locale={locale}
              highlightQuery=""
              setForwardsNavHighlightHandler={noop}
              setBackwardsNavHighlightHandler={noop}
            />
          </div>
        ) : (
          <p className="skill-tree-detail-description">
            {skillDescription || "No description available."}
          </p>
        )}
        <div className="skill-tree-detail-actions">
          {learned ? (
            <span className="skill-tree-detail-learned">Learned</span>
          ) : (
            <>
              {learnHint && (
                <span className="skill-tree-detail-hint">{learnHint}</span>
              )}
              <button
                type="button"
                className="skill-tree-detail-learn-button"
                onClick={handleLearn}
                disabled={!canLearn}
              >
                Learn
              </button>
            </>
          )}
        </div>
      </div>
    </BaseModal>
  );
}

export const SkillTreeDetailModalDefinition: ModalDefinitionType<"skillTreeDetail"> =
  {
    modalName: "skillTreeDetail",
    component: SkillTreeDetailModal
  };
