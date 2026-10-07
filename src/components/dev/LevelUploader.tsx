import { Button } from "@mui/material";
import cx from "classnames";
import path from "path-browserify";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DropTargetMonitor, useDrop } from "react-dnd";
import { NativeTypes } from "react-dnd-html5-backend";
import shortid from "shortid";

import {
  LevelDefinitionAPI,
  TilesetDefinitionAPI
} from "src/engine/level/LevelLoaderAPI";
import { levelLoaderContext } from "src/engine/level/LevelLoaderContext";
import * as TiledJson from "src/engine/level/tiled/tiledJson";
import { gotoLevel } from "src/redux/gameState/slice";
import { useAppDispatch } from "src/redux/hooks";

import { Icon } from "../ui/icons/Icon";
import "./LevelUploader.less";

const allowedFileExtensionSet = new Set([".tsj", ".tmj", ".png"]);

// TODO: make this a type union instead of one thing with lots of options.
type WorkingFile = {
  file: File;
  processing?: boolean;
  processed?: boolean;
  pngDataUrl?: string;
  tiledLevelJson?: TiledJson.ITiledLevelJSON;
  tiledTileSetJson?: TiledJson.ITiledTileSetJSON;
};

type ProcessedResult = {
  ok?: boolean;
  missingMap?: boolean;
  missingTileSets?: string[];
  missingImages?: string[];
  targetLevelName?: string;
  targetLevelDefinition?: LevelDefinitionAPI;
};

export function LevelUploader() {
  const dispatch = useAppDispatch();
  const [workingFiles, setWorkingFiles] = useState<Map<string, WorkingFile>>(
    () => new Map()
  );
  const [result, setResult] = useState<ProcessedResult>(() => ({}));

  const [{ canDrop }, drop] = useDrop(() => ({
    accept: [NativeTypes.FILE],
    drop(item: { files: File[] }) {
      const newFileEntries: [string, WorkingFile][] = [];
      for (const file of item.files) {
        const name = file.name;
        const ext = path.parse(name).ext;
        if (!allowedFileExtensionSet.has(ext)) {
          console.error("Unrecognized file:", name);
          return;
        }
        newFileEntries.push([
          name,
          {
            file
          }
        ]);
      }
      setWorkingFiles((wf) => new Map([...wf.entries(), ...newFileEntries]));
    },
    canDrop(item: { files: File[] }) {
      for (const file of item.files) {
        const name = file.name;
        const ext = path.parse(name).ext;
        if (!allowedFileExtensionSet.has(ext)) return false;
      }
      return true;
    },
    collect: (monitor: DropTargetMonitor) => {
      const _item = monitor.getItem();
      return {
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop()
      };
    }
  }));

  useEffect(() => {
    let foundMap: TiledJson.ITiledLevelJSON | undefined;
    let foundMapName = "";
    for (const file of workingFiles.values()) {
      if (file.tiledLevelJson) {
        foundMap = file.tiledLevelJson;
        foundMapName = path.parse(file.file.name).base;
        break;
      }
    }
    if (!foundMap) {
      setResult({
        ok: false,
        missingMap: true
      });
      return;
    }
    const usedImages = new Set<string>();
    const missingTileSets = new Set<string>();
    const missingImages = new Set<string>();
    const fullTileSets = new Map<string, TilesetDefinitionAPI>();
    for (const tileset of foundMap.tilesets) {
      const sourcePath = path.parse(tileset.source);
      const sourceFileName = sourcePath.base;
      const workingTileSet = workingFiles.get(sourceFileName);
      if (workingTileSet?.tiledTileSetJson) {
        const imagePath = path.parse(workingTileSet.tiledTileSetJson.image);
        const workingImage = workingFiles.get(imagePath.base);
        if (workingImage?.pngDataUrl) {
          fullTileSets.set(sourcePath.base, {
            tileSetImage: workingImage.pngDataUrl,
            tileSetJson: workingTileSet.tiledTileSetJson
          });
          usedImages.add(imagePath.base);
        } else {
          missingImages.add(imagePath.base);
        }
      } else {
        missingTileSets.add(sourcePath.base);
      }
    }
    if (missingTileSets.size > 0 || missingImages.size > 0) {
      setResult({
        ok: false,
        missingTileSets: [...missingTileSets],
        missingImages: [...missingImages]
      });
      return;
    }
    const extraImages: Record<string, string> = {};
    for (const [fileName, file] of workingFiles) {
      if (file.pngDataUrl !== undefined) {
        extraImages[fileName] = file.pngDataUrl;
      }
    }
    const tileSetsObj: Record<string, TilesetDefinitionAPI> = {};
    for (const [fileName, tileSet] of fullTileSets) {
      const tileSetName = path.parse(fileName).name;
      tileSetsObj[tileSetName] = tileSet;
    }
    setResult({
      ok: true,
      targetLevelName: foundMapName,
      targetLevelDefinition: {
        id: foundMapName,
        mapJson: foundMap,
        images: extraImages,
        tileSets: tileSetsObj
      }
    });
  }, [workingFiles]);

  const errors = useMemo(() => {
    if (result.ok) return null;
    const errs: string[] = [];
    if (result.missingMap) errs.push("No map.");
    if (result.missingTileSets) {
      for (const missing of result.missingTileSets) {
        errs.push(`Missing Tileset: ${missing}`);
      }
    }
    if (result.missingImages) {
      for (const missing of result.missingImages) {
        errs.push(`Missing Image: ${missing}`);
      }
    }
    return errs;
  }, [result]);

  const applyResult = useCallback(() => {
    if (
      !result.ok ||
      !result.targetLevelName ||
      !result.targetLevelDefinition
    ) {
      return;
    }
    const uniqueLevelName = `hot-${result.targetLevelName}-${shortid()}`;
    levelLoaderContext.hotLoaders.levels.updateResource(
      uniqueLevelName,
      result.targetLevelDefinition
    );
    dispatch(
      gotoLevel({
        levelId: uniqueLevelName
      })
    );
  }, [dispatch, result]);

  return (
    <div className="level-uploader">
      <div
        ref={(el) => {
          drop(el);
        }}
        className={cx("drop-files-here", canDrop && "can-drop")}
      >
        Drop files here!
      </div>
      {result.ok && (
        <Button className="apply" onClick={applyResult}>
          Assets Accepted - Play Level!
        </Button>
      )}
      <div className="files-list">
        {[...workingFiles.entries()].map(([fileName, workingFile]) => (
          <DisplayFile
            key={fileName}
            file={workingFile}
            onProcessed={(key, file) => {
              setWorkingFiles((wf) => {
                const newWf = new Map(wf);
                newWf.set(key, file);
                return newWf;
              });
            }}
            onRemoved={(name) => {
              setWorkingFiles((wf) => {
                const newWf = new Map(wf);
                newWf.delete(name);
                return newWf;
              });
            }}
          />
        ))}
      </div>
      {errors && (
        <div className="errors">
          {errors.map((err, i) => (
            <div key={i}>{err}</div>
          ))}
        </div>
      )}
    </div>
  );
}

type DisplayFileProps = {
  file: WorkingFile;
  onProcessed?: (name: string, file: WorkingFile) => void;
  onRemoved?: (name: string) => void;
};

function DisplayFile(props: DisplayFileProps) {
  const { file, onProcessed, onRemoved } = props;

  const cbs = useMemo<{
    onProcessed?: typeof onProcessed;
    onRemoved?: typeof onRemoved;
  }>(() => ({}), []);
  cbs.onProcessed = onProcessed;
  cbs.onRemoved = onRemoved;

  const [fileProcessed, setFileProcessed] = useState(() => file.processed);
  const fileName = useMemo(() => file.file.name, [file]);
  const fileExtension = useMemo(() => path.parse(file.file.name).ext, [file]);

  useEffect(() => {
    if (file.processed || file.processing) return;
    file.processing = true;

    const processFile = async () => {
      switch (fileExtension) {
        case ".png": {
          const buff = await file.file.arrayBuffer();
          const blob = new Blob([buff], { type: "image/png" });
          const objectUrl = URL.createObjectURL(blob);
          file.pngDataUrl = objectUrl;
          break;
        }
        case ".tsj": {
          const buff = await file.file.text();
          const json = JSON.parse(buff);
          file.tiledTileSetJson = json;
          break;
        }
        case ".tmj": {
          const buff = await file.file.text();
          const json = JSON.parse(buff);
          file.tiledLevelJson = json;
          break;
        }
      }
      file.processed = true;
      setFileProcessed(true);
      cbs.onProcessed?.(file.file.name, file);
    };

    processFile();

    return () => {
      file.processing = false;
    };
  }, [file, fileExtension, cbs]);

  return (
    <div className="display-file">
      <div className="status">
        <Icon icon={fileProcessed ? "check" : "file"} />
      </div>
      <div className="extension">{fileExtension}</div>
      <div className="name">{fileName}</div>
      <div className="remove" onClick={() => onRemoved?.(file.file.name)}>
        <Icon icon="closeWindow" />
      </div>
    </div>
  );
}
