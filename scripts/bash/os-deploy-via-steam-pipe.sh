#!/bin/sh

OUT_PATH="$(pwd)/out/Open Sourcerer-darwin-arm64"
CONTENT_PATH=$(pwd)/steampipe/content
VDF_PATH=$(pwd)/steampipe/testing.vdf

# The vdfs now map one subdirectory of content/ per platform depot; local
# deploys only produce the macOS build.
rm -rf $CONTENT_PATH
mkdir -p "$CONTENT_PATH/darwin-arm64"
cp -r "$OUT_PATH"/* "$CONTENT_PATH"/darwin-arm64/

echo "Invoking SteamPipe..."
./steampipe/sdk/tools/ContentBuilder/builder_osx/steamcmd.sh +login uncommented +run_app_build $VDF_PATH +quit
