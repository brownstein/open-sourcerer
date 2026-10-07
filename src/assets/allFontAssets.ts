import { Loader } from "src/api/loader";
import {
  HarfbuzzBlobLoader,
  ThreeTTFFontLoader
} from "src/engine/loader/Loaders";
import directMessageTTF from "src/fonts/direct-message/Direct_Message.ttf";
import directMessageBoldTTF from "src/fonts/direct-message/Direct_Message_Bold.ttf";
import fredokaTTF from "src/fonts/fredoka/Fredoka-SemiBold.ttf";
import highbirthTTF from "src/fonts/highbirth/highbirth.ttf";
import koboldTTF from "src/fonts/kobold/Kobold 7.ttf";
import mssnTTF from "src/fonts/mssn/mssn-madoka.ttf";
import roboto700TTF from "src/fonts/roboto/roboto-v20-latin-700.ttf";

const allFontAssets = {
  directMessageFont: new ThreeTTFFontLoader(
    "directMessageTTF",
    directMessageTTF
  ),
  directMessageBoldFont: new ThreeTTFFontLoader(
    "directMessageBoldTTF",
    directMessageBoldTTF
  ),
  mssnFont: new ThreeTTFFontLoader("mssnTTF", mssnTTF),
  fredokaFont: new ThreeTTFFontLoader("fredokaTTF", fredokaTTF),
  highbirthFont: new ThreeTTFFontLoader("highbirthTTF", highbirthTTF),
  koboldFont: new ThreeTTFFontLoader("koboldTTF", koboldTTF),
  roboto700Font: new ThreeTTFFontLoader("roboto700TTF", roboto700TTF),
  // These blobs are used by TextPixelated.
  directMessageBlob: new HarfbuzzBlobLoader(
    "directMessageBlob",
    directMessageTTF
  ),
  directMessageBoldBlob: new HarfbuzzBlobLoader(
    "directMessageBoldBlob",
    directMessageBoldTTF
  ),
  mssnBlob: new HarfbuzzBlobLoader("mssnBlob", mssnTTF),
  fredokaBlob: new HarfbuzzBlobLoader("fredokaBlob", fredokaTTF),
  highbirthBlob: new HarfbuzzBlobLoader("highbirthBlob", highbirthTTF),
  koboldBlob: new HarfbuzzBlobLoader("koboldBlob", koboldTTF),
  roboto700Blob: new HarfbuzzBlobLoader("roboto700Blob", roboto700TTF)
} satisfies Record<string, Loader>;

export type FontAssets = typeof allFontAssets;

export default allFontAssets;
