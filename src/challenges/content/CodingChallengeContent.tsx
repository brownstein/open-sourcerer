import { MDXComponents, MDXContent, MDXModule } from "mdx/types";
import { memo, useContext, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import {
  CodingChallengeQuizAnswer,
  CodingChallengeQuizExplanation,
  CodingChallengeQuizQuestion
} from "src/challenges/components/CodingChallengeQuiz";
import { CodingChallengeContentContext } from "src/challenges/components/context";
import { ExampleCode } from "src/components/code/ExampleCode";

import "./CodingChallengeContent.css";

const defaultLanguage = "en";

type MDXModuleWithMetadata = MDXModule & {
  quizzes?: string[];
};

type CodingChallengeContentRegistry = Record<
  string,
  Record<string, MDXModuleWithMetadata>
>;

const codingChallengeModules = import.meta.glob<MDXModuleWithMetadata>(
  "src/challenges/content/*/**/*.mdx",
  {
    eager: true
  }
);

const registry: CodingChallengeContentRegistry = {};

for (const [path, module] of Object.entries(codingChallengeModules)) {
  const contentIndex = path.indexOf("content");
  const contentPath = path.slice(contentIndex);
  const contentPathParts = contentPath.split("/");
  const pathLocale = contentPathParts.at(1);
  if (!pathLocale) continue;
  const pathFileNameWithExtension = contentPathParts.slice(2).join("/");
  const pathFileNameParts = pathFileNameWithExtension?.split(".");
  const pathFileName = pathFileNameParts?.at(0);
  if (!pathFileName) continue;
  if (!registry[pathFileName]) registry[pathFileName] = {};
  registry[pathFileName][pathLocale] = module;
}

export function resolveCodingChallengeModule(
  contentName: string,
  language: string
) {
  const registryContent = registry[contentName];
  if (!registryContent) {
    console.warn("Missing coding challenge content", contentName);
    return null;
  }
  const mod = registryContent[language] ?? registryContent[defaultLanguage];
  if (!mod) {
    console.warn("Missing coding challenge content component", contentName);
    return null;
  }
  return mod;
}

const codingChallengeComponents: MDXComponents = {
  pre: ({ children, className }) => <pre className={className}>{children}</pre>,
  ExampleCode,
  Question: CodingChallengeQuizQuestion,
  Answer: CodingChallengeQuizAnswer,
  Explanation: CodingChallengeQuizExplanation
};

export type CodingChallengeContentProps = {
  contentName: string;
};

export function _CodingChallengeContent(props: CodingChallengeContentProps) {
  const ctx = useContext(CodingChallengeContentContext);
  const { challengeProvider, segmentIndex } = ctx ?? {};
  const { contentName } = props;
  const { i18n } = useTranslation();
  const { language } = i18n;

  const mod = useMemo(
    () => resolveCodingChallengeModule(contentName, language),
    [contentName, language]
  );

  // Mark content as initialized on initial render, and populate
  // quiz question state if there is any.
  useEffect(() => {
    if (
      challengeProvider === undefined ||
      segmentIndex === undefined ||
      mod === null
    ) {
      return;
    }
    challengeProvider.markStateInitialized(segmentIndex);
    if (mod.quizzes) {
      challengeProvider.defineQuizQuestions(segmentIndex, mod.quizzes);
    }
  }, [challengeProvider, segmentIndex, mod]);

  const endRef = useRef<HTMLDivElement>(null);
  const endHit = useRef(false);
  useEffect(() => {
    if (
      !endRef.current ||
      challengeProvider === undefined ||
      segmentIndex === undefined
    )
      return;
    let containerEl: HTMLElement | null = endRef.current;
    while (
      containerEl !== null &&
      !containerEl.className.includes("screen-region-inner")
    ) {
      containerEl = containerEl.parentElement;
    }
    if (!containerEl) return;
    const onIntersect: IntersectionObserverCallback = (entries) => {
      if (endHit.current) return;
      for (const entry of entries) {
        if (entry.intersectionRatio === 1) {
          endHit.current = true;
          challengeProvider.markScrollComplete(segmentIndex);
        }
      }
    };
    const observer = new IntersectionObserver(onIntersect, {
      root: containerEl,
      rootMargin: "0px",
      threshold: 1.0
    });
    observer.observe(endRef.current);
    return () => observer.disconnect();
  }, [challengeProvider, segmentIndex]);

  const ContentComponent = mod?.default;
  if (!ContentComponent) return null;

  return (
    <div className="coding-challenge-content">
      <ContentComponent components={codingChallengeComponents} />
      <div className="coding-challenge-content-scroll-checker" ref={endRef} />
    </div>
  );
}

export const CodingChallengeContent = memo(_CodingChallengeContent);

export type MiniCodingChallengeContentProps = {
  contentName: string;
};

export function MiniCodingChallengeContent(props: MiniCodingChallengeContentProps) {
  const { contentName } = props;
  const { i18n } = useTranslation();
  const { language } = i18n;

  const mod = useMemo(
    () => resolveCodingChallengeModule(contentName, language),
    [contentName, language]
  );
  const content = useMemo(() => {
    const ContentComponent = mod?.default;
    if (!ContentComponent) return null;
    return <ContentComponent components={codingChallengeComponents} />;
  }, [mod]);

  return (
    <div className="mini-coding-challenge-content">
      { content }
    </div>
  );
}
