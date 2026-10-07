/**
 * Vendored replacement for load-bmfont/browser.
 *
 * The upstream package (v1.4.2) uses Node.js Buffer at module scope which
 * requires a global polyfill in Vite. This version drops the Buffer
 * dependency entirely by using fetch() and handling only the text-based
 * font formats (JSON, XML, ASCII) that this project actually uses.
 */

import parseASCII from "parse-bmfont-ascii";
import parseXML from "parse-bmfont-xml";

export type BMFont = {
  pages: string[];
  chars: {
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
    xoffset: number;
    yoffset: number;
    xadvance: number;
    page: number;
    chanl: number;
  }[];
  kernings: {
    first: number;
    second: number;
    amount: number;
  }[];
  info: {
    face: string;
    size: number;
    bold: number;
    italic: number;
    charset: string;
    unicode: number;
    stretchH: number;
    smooth: number;
    aa: number;
    padding: [number, number, number, number];
    spacing: [number, number];
  };
  common: {
    lineHeight: number;
    base: number;
    scaleW: number;
    scaleH: number;
    pages: number;
    packed: number;
    alphaChnl: number;
    redChnl: number;
    greenChnl: number;
    blueChnk: number;
  };
};

type LoadCallback = (err: Error | null, font: BMFont) => void;

export default function loadBMFont(
  opt: string | { uri: string },
  cb: LoadCallback
): void {
  const uri = typeof opt === "string" ? opt : opt.uri;

  fetch(uri)
    .then((res) => {
      if (!res.ok) {
        throw new Error("http status code: " + res.status);
      }
      return res.text().then((text) => ({
        text,
        contentType: res.headers.get("content-type") || ""
      }));
    })
    .then(({ text, contentType }) => {
      if (!text) {
        throw new Error("no body result");
      }
      const body = text.trim();

      let result: BMFont;
      if (/json/.test(contentType) || body.charAt(0) === "{") {
        result = JSON.parse(body);
      } else if (/xml/.test(contentType) || body.charAt(0) === "<") {
        result = parseXML(body);
      } else {
        result = parseASCII(body);
      }
      cb(null, result);
    })
    .catch((err: Error) => {
      cb(err, undefined as unknown as BMFont);
    });
}
