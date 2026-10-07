// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom";
import React from "react";
import * as THREE from "three";

(global as unknown as Record<string, unknown>).React = React;
(global as unknown as Record<string, unknown>).THREE = THREE;

jest.mock("src/scripting/runtime/SpellWorkerConnection", () => {
  const mod = require("./scripting/runtime/SpellWorkerConnection.tester");
  return {
    __esModule: true,
    ...mod
  };
});
