import "./LoadingScreen.less";

export interface ILoadingScreenProps {
  percentLoaded?: number;
}

export function LoadingScreen({ percentLoaded }: ILoadingScreenProps) {
  const percentDisplay =
    percentLoaded === undefined
      ? undefined
      : `${Math.round(percentLoaded * 100)}%`;

  return (
    <div className="loading-screen">
      <div className="loading-ring" />
      <div className="loading-sword" />
      <div className="loading-text">
        <div>LOADING</div>
        {percentDisplay ? <div>{percentDisplay}</div> : null}
      </div>
    </div>
  );
}
