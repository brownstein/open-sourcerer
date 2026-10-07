import { FC, Suspense, lazy } from "react";
import { Provider } from "react-redux";

import { LoadingScreen } from "src/components/preloader/LoadingScreen";
import "src/i18n/i18n";
import { store } from "src/redux/store";

import "./index.less";

// Main stylesheet for the application

const MainEntryPoint = lazy(() => import("src/components/MainEntryPoint")); // Lazily loaded Controller component for better performance

const App: FC = () => {
  return (
    <div className="outer">
      <Provider store={store}>
        <Suspense fallback={<LoadingScreen />}>
          <MainEntryPoint />
        </Suspense>
      </Provider>
    </div>
  );
};

export default App; // Exports the App component for use in other parts of the application
