import React from "react";
import { createRoot } from "react-dom/client";
// Importing the App component which is the root of your React component tree
import { Provider } from "react-redux";

// Import createRoot for using React 18+ new root API
import App from "./App";
import "./index.less";
// Importing Provider from react-redux to make Redux store available to your React component hierarchy
import { store } from "./redux/store";
import { renderLevelScreenshot } from "./util/levelScreenshot";
import { analyticsTrackPageView } from "./engine/analytics/Analytics";

// Importing the main styles for your application

async function runScreenshotMode(levelId: string) {
  const png = await renderLevelScreenshot(levelId, {
    width: 512,
    height: 512
  });
  const blob = new Blob([png as BlobPart], { type: "image/png" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${levelId}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function init() {
  const params = new URLSearchParams(window.location.search);
  const screenshotLevelId = params.get("screenshot");
  if (screenshotLevelId) {
    runScreenshotMode(screenshotLevelId).catch((err) => {
      console.error("Failed to render level screenshot:", err);
    });
    return;
  }

  const container = document.getElementById("root"); // Locating the DOM element with the ID 'root' where the React app will be mounted
  if (!container) {
    return; // If no container with the ID 'root' is found, the function returns early to prevent errors
  }
  const root = createRoot(container); // Create a new root instance using the container found
  // Using the root instance to render the App component wrapped in a Provider component
  // The Provider component passes the Redux store to the React component tree
  // React.StrictMode is a tool for highlighting potential problems in an application
  root.render(
    <React.StrictMode>
      <Provider store={store}>
        <App />
      </Provider>
    </React.StrictMode>
  );

  // Track the initial load as a page view.
  analyticsTrackPageView();
}

init(); // Calling the init function to initialize and render the React application
