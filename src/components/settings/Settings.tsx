import {
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  Switch
} from "@mui/material";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { UIComponentProps } from "src/components/ui/config/types";
import { useAppDispatch, useAppSelector } from "src/redux/hooks";
import {
  selectAmbianceVolume,
  selectDarkMode,
  selectLanguage,
  selectMasterVolume,
  selectMusicVolume,
  selectMuted,
  selectSfxVolume,
  selectTabButtonTextColor,
  selectTabOverlayColor,
  selectUiVolume
} from "src/redux/settings/selectors";
import {
  defaultAmbianceVolume,
  defaultButtonTextColor,
  defaultDarkMode,
  defaultLanguage,
  defaultMasterVolume,
  defaultMusicVolume,
  defaultMuted,
  defaultOverlayColor,
  defaultSfxVolume,
  defaultUiVolume,
  resetAllKeyBindings,
  setAmbianceVolume,
  setDarkMode,
  setLanguage,
  setMasterVolume,
  setMusicVolume,
  setMuted,
  setSfxVolume,
  setTabButtonTextColor,
  setTabOverlayColor,
  setUiVolume
} from "src/redux/settings/slice";

import { ColorSliders } from "../color-slider/ColorSliders";
import { KeyBindingsSection } from "./KeyBindings";
import "./Settings.less";

export type SettingsTabProps = UIComponentProps<"settings">;

export function SettingsTab() {
  const dispatch = useAppDispatch();
  const { t: _t } = useTranslation();
  const tabOverlayColor = useAppSelector(selectTabOverlayColor);
  const tabButtonTextColor = useAppSelector(selectTabButtonTextColor);
  const language = useAppSelector(selectLanguage);
  const masterVolume = useAppSelector(selectMasterVolume);
  const sfxVolume = useAppSelector(selectSfxVolume);
  const musicVolume = useAppSelector(selectMusicVolume);
  const ambianceVolume = useAppSelector(selectAmbianceVolume);
  const uiVolume = useAppSelector(selectUiVolume);
  const muted = useAppSelector(selectMuted);
  const darkMode = useAppSelector(selectDarkMode);

  useEffect(() => {
    const overlayRgba = `rgba(${tabOverlayColor.r},${tabOverlayColor.g},${tabOverlayColor.b},${tabOverlayColor.a})`;
    const textRgba = `rgba(${tabButtonTextColor.r},${tabButtonTextColor.g},${tabButtonTextColor.b},${tabButtonTextColor.a})`;
    document.documentElement.style.setProperty(
      "--tab-overlay-color",
      overlayRgba
    );
    (
      document.querySelector(".flexlayout__layout") as HTMLElement | null
    )?.style.setProperty("--tab-button-text-color", textRgba);
  }, [tabOverlayColor, tabButtonTextColor]);

  // TODO: localize.
  return (
    <div className="settings-tab-container">
      <h2>Settings</h2>
      <div className="section">
        <div className="setting">
          <label>Dark Mode</label>
          <div className="dark-mode-toggle">
            <Switch
              checked={darkMode}
              onChange={(_, checked) => dispatch(setDarkMode(checked))}
              size="small"
            />
          </div>
        </div>
        <div className={`setting${muted ? " audio-muted" : ""}`}>
          <div className="master-volume-header">
            <label>Master Volume</label>
            <Switch
              checked={!muted}
              onChange={(_, checked) => dispatch(setMuted(!checked))}
              size="small"
            />
          </div>
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={masterVolume}
            valueLabelDisplay="auto"
            valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
            onChange={(_, v) => dispatch(setMasterVolume(v))}
          />
        </div>
        <div className={`setting${muted ? " audio-muted" : ""}`}>
          <label>Effects Volume</label>
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={sfxVolume}
            valueLabelDisplay="auto"
            valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
            onChange={(_, v) => dispatch(setSfxVolume(v))}
          />
        </div>
        <div className={`setting${muted ? " audio-muted" : ""}`}>
          <label>Music Volume</label>
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={musicVolume}
            valueLabelDisplay="auto"
            valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
            onChange={(_, v) => dispatch(setMusicVolume(v))}
          />
        </div>
        <div className={`setting${muted ? " audio-muted" : ""}`}>
          <label>Ambiance Volume</label>
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={ambianceVolume}
            valueLabelDisplay="auto"
            valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
            onChange={(_, v) => dispatch(setAmbianceVolume(v))}
          />
        </div>
        <div className={`setting${muted ? " audio-muted" : ""}`}>
          <label>UI Volume</label>
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={uiVolume}
            valueLabelDisplay="auto"
            valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
            onChange={(_, v) => dispatch(setUiVolume(v))}
          />
        </div>
        <div className="setting">
          <label>Tab Button Overlay Color</label>
          <ColorSliders
            color={tabOverlayColor}
            onChange={(color) => dispatch(setTabOverlayColor(color))}
          />
        </div>
        <div className="setting">
          <label>Tab Button Text Color</label>
          <ColorSliders
            color={tabButtonTextColor}
            onChange={(color) => dispatch(setTabButtonTextColor(color))}
          />
        </div>
        <div className="setting">
          <KeyBindingsSection />
        </div>
        <div className="setting">
          <FormControl size="small" fullWidth>
            <InputLabel>Language</InputLabel>
            <Select
              value={language}
              label="Language"
              onChange={(e) => {
                dispatch(setLanguage(e.target.value));
              }}
            >
              <MenuItem value="en">English</MenuItem>
              <MenuItem value="hi">Hindi</MenuItem>
            </Select>
          </FormControl>
        </div>
        <Button
          variant="outlined"
          size="small"
          onClick={() => {
            dispatch(setMasterVolume(defaultMasterVolume));
            dispatch(setSfxVolume(defaultSfxVolume));
            dispatch(setMusicVolume(defaultMusicVolume));
            dispatch(setAmbianceVolume(defaultAmbianceVolume));
            dispatch(setUiVolume(defaultUiVolume));
            dispatch(setMuted(defaultMuted));
            dispatch(setTabOverlayColor(defaultOverlayColor));
            dispatch(setTabButtonTextColor(defaultButtonTextColor));
            dispatch(setLanguage(defaultLanguage));
            dispatch(setDarkMode(defaultDarkMode));
            dispatch(resetAllKeyBindings());
          }}
        >
          Reset to Defaults
        </Button>
      </div>
    </div>
  );
}
