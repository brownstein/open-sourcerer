import { ReactElement, useEffect, useState } from "react";

import { Loader } from "src/api/loader";
import { mainPreloader } from "src/engine/loader/MainPreloader";

import { LoadingScreen } from "./LoadingScreen";
import "./Preloader.less";

export type MainPreloaderProps = {
  children?: ReactElement | null;
};

// TODO: progress bar.
export function MainPreloader(props: MainPreloaderProps) {
  const { children } = props;
  const [loaded, setLoaded] = useState<boolean>(false);
  const [amountLoaded, setAmountLoaded] = useState<number>(0);

  useEffect(() => {
    const onProgress = (loader: Loader<unknown>) =>
      setAmountLoaded(loader.resourceProgress);
    const mainLoadSequence = async () => {
      await mainPreloader.load();
      setLoaded(true);
    };
    mainPreloader.loader.on("progress", onProgress);
    mainLoadSequence();
    return () => {
      mainPreloader.loader.off("progress", onProgress);
    };
  }, []);

  if (!loaded) return <LoadingScreen percentLoaded={amountLoaded} />;
  return children ?? null;
}
