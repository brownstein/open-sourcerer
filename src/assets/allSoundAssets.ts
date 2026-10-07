import { Loader } from "src/api/loader";
import { AudioResourceLoader } from "src/engine/loader/Loaders";
import hupMp3 from "src/entities/player/sounds/hup.mp3";
import swipeMp3 from "src/entities/player/sounds/swipe.mp3";
import chatter1Wav from "src/entities/ui/sfx/chatter/chatter1.wav";
import chatter2Wav from "src/entities/ui/sfx/chatter/chatter2.wav";
import chatter3Wav from "src/entities/ui/sfx/chatter/chatter3.wav";
import chatter4Wav from "src/entities/ui/sfx/chatter/chatter4.wav";
import chatter5Wav from "src/entities/ui/sfx/chatter/chatter5.wav";
import chatter6Wav from "src/entities/ui/sfx/chatter/chatter6.wav";

import fireExplosionWav from "./sounds/general/fire-explosion.wav";
import heal1Wav from "./sounds/general/heal-1.wav";
import hit1Mp3 from "./sounds/general/hit-1.mp3";
import hit2Mp3 from "./sounds/general/hit-2.mp3";
import hit3Mp3 from "./sounds/general/hit-3.mp3";
import hit4Mp3 from "./sounds/general/hit-4.mp3";
import waterSplashHighMp3 from "./sounds/general/water-splash-hi.mp3";
import waterSplashLowMp3 from "./sounds/general/water-splash-low.mp3";
import fireOpus from "./sounds/magic/fire.opus";
import electricityMagicEndOpus from "./sounds/magic/magic-electricity-end.opus";
import electricityMagicLoopOpus from "./sounds/magic/magic-electricity-loop.opus";
import electricityMagicStartOpus from "./sounds/magic/magic-electricity-start.opus";
import generalMagicEndOpus from "./sounds/magic/magic-end.opus";
import fireMagicEndOpus from "./sounds/magic/magic-fire-end.opus";
import fireMagicLoopOpus from "./sounds/magic/magic-fire-loop.opus";
import fireMagicStartOpus from "./sounds/magic/magic-fire-start.opus";
import iceMagicEndOpus from "./sounds/magic/magic-ice-end.opus";
import iceMagicLoopOpus from "./sounds/magic/magic-ice-loop.opus";
import iceMagicStartOpus from "./sounds/magic/magic-ice-start.opus";
import generalMagicLoopOpus from "./sounds/magic/magic-loop.opus";
import generalMagicStartOpus from "./sounds/magic/magic-start.opus";
import windMagicEndOpus from "./sounds/magic/magic-wind-end.opus";
import windMagicLoopOpus from "./sounds/magic/magic-wind-loop.opus";
import windMagicStartOpus from "./sounds/magic/magic-wind-start.opus";
import spellPickup1Opus from "./sounds/magic/spell-pickup-1.opus";
import hitEnemy1Mp3 from "./sounds/player/hit-enemies-1.mp3";
import hitEnemy2Mp3 from "./sounds/player/hit-enemies-2.mp3";
import hitEnemy3Mp3 from "./sounds/player/hit-enemies-3.mp3";
import hitEnemy4Mp3 from "./sounds/player/hit-enemies-4.mp3";
import playerFallMp3 from "./sounds/player/player-fall.mp3";
import playerJumpMp3 from "./sounds/player/player-jump.mp3";
import playerStep1Mp3 from "./sounds/player/player-step-1.mp3";
import playerStep2Mp3 from "./sounds/player/player-step-2.mp3";
import playerStep3Mp3 from "./sounds/player/player-step-3.mp3";
import playerStep4Mp3 from "./sounds/player/player-step-4.mp3";
import playerSword1Mp3 from "./sounds/player/sword-1.mp3";
import playerSword2Mp3 from "./sounds/player/sword-2.mp3";
import playerSword3Mp3 from "./sounds/player/sword-3.mp3";
import playerSword4Mp3 from "./sounds/player/sword-4.mp3";

const allSoundAssets = {
  hupSound: new AudioResourceLoader("hupSound", hupMp3),
  swipeSound: new AudioResourceLoader("swipeSound", swipeMp3),
  chatter1Sound: new AudioResourceLoader("chatter1Sound", chatter1Wav),
  chatter2Sound: new AudioResourceLoader("chatter2Sound", chatter2Wav),
  chatter3Sound: new AudioResourceLoader("chatter3Sound", chatter3Wav),
  chatter4Sound: new AudioResourceLoader("chatter4Sound", chatter4Wav),
  chatter5Sound: new AudioResourceLoader("chatter5Sound", chatter5Wav),
  chatter6Sound: new AudioResourceLoader("chatter6Sound", chatter6Wav),
  hit1Sound: new AudioResourceLoader("hit1Sound", hit1Mp3),
  hit2Sound: new AudioResourceLoader("hit2Sound", hit2Mp3),
  hit3Sound: new AudioResourceLoader("hit3Sound", hit3Mp3),
  hit4Sound: new AudioResourceLoader("hit4Sound", hit4Mp3),
  heal1Sound: new AudioResourceLoader("heal1Sound", heal1Wav),
  hitEnemy1Sound: new AudioResourceLoader("hitEnemy1Sound", hitEnemy1Mp3),
  hitEnemy2Sound: new AudioResourceLoader("hitEnemy2Sound", hitEnemy2Mp3),
  hitEnemy3Sound: new AudioResourceLoader("hitEnemy3Sound", hitEnemy3Mp3),
  hitEnemy4Sound: new AudioResourceLoader("hitEnemy4Sound", hitEnemy4Mp3),
  playerFallSound: new AudioResourceLoader("playerFallSound", playerFallMp3),
  playerJumpSound: new AudioResourceLoader("playerJumpSound", playerJumpMp3),
  playerStep1Sound: new AudioResourceLoader("playerStep1Sound", playerStep1Mp3),
  playerStep2Sound: new AudioResourceLoader("playerStep2Sound", playerStep2Mp3),
  playerStep3Sound: new AudioResourceLoader("playerStep3Sound", playerStep3Mp3),
  playerStep4Sound: new AudioResourceLoader("playerStep4Sound", playerStep4Mp3),
  playerSword1Sound: new AudioResourceLoader(
    "playerSword1Sound",
    playerSword1Mp3
  ),
  playerSword2Sound: new AudioResourceLoader(
    "playerSword2Sound",
    playerSword2Mp3
  ),
  playerSword3Sound: new AudioResourceLoader(
    "playerSword3Sound",
    playerSword3Mp3
  ),
  playerSword4Sound: new AudioResourceLoader(
    "playerSword4Sound",
    playerSword4Mp3
  ),
  waterSplashLowSound: new AudioResourceLoader(
    "waterSplashLowSound",
    waterSplashLowMp3
  ),
  waterSplashHighSound: new AudioResourceLoader(
    "waterSplashHighSound",
    waterSplashHighMp3
  ),
  generalMagicStartSound: new AudioResourceLoader(
    "generalMagicStartSound",
    generalMagicStartOpus
  ),
  generalMagicLoopSound: new AudioResourceLoader(
    "generalMagicLoopSound",
    generalMagicLoopOpus
  ),
  generalMagicEndSound: new AudioResourceLoader(
    "generalMagicEndSound",
    generalMagicEndOpus
  ),
  fireMagicStartSound: new AudioResourceLoader(
    "fireMagicStartSound",
    fireMagicStartOpus
  ),
  fireMagicLoopSound: new AudioResourceLoader(
    "fireMagicLoopSound",
    fireMagicLoopOpus
  ),
  fireMagicEndSound: new AudioResourceLoader(
    "fireMagicEndSound",
    fireMagicEndOpus
  ),
  iceMagicStartSound: new AudioResourceLoader(
    "iceMagicStartSound",
    iceMagicStartOpus
  ),
  iceMagicLoopSound: new AudioResourceLoader(
    "iceMagicLoopSound",
    iceMagicLoopOpus
  ),
  iceMagicEndSound: new AudioResourceLoader(
    "iceMagicEndSound",
    iceMagicEndOpus
  ),
  windMagicStartSound: new AudioResourceLoader(
    "windMagicStartSound",
    windMagicStartOpus
  ),
  windMagicLoopSound: new AudioResourceLoader(
    "windMagicLoopSound",
    windMagicLoopOpus
  ),
  windMagicEndSound: new AudioResourceLoader(
    "windMagicEndSound",
    windMagicEndOpus
  ),
  electricityMagicStartSound: new AudioResourceLoader(
    "electricityMagicStartSound",
    electricityMagicStartOpus
  ),
  electricityMagicLoopSound: new AudioResourceLoader(
    "electricityMagicLoopSound",
    electricityMagicLoopOpus
  ),
  electricityMagicEndSound: new AudioResourceLoader(
    "electricityMagicEndSound",
    electricityMagicEndOpus
  ),
  fireSound: new AudioResourceLoader("fireSound", fireOpus),
  fireExplosionSound: new AudioResourceLoader(
    "fireExplosionSound",
    fireExplosionWav
  ),
  spellPickup1Sound: new AudioResourceLoader(
    "spellPickup1Sound",
    spellPickup1Opus
  )
} satisfies Record<string, Loader>;

export type SoundAssets = typeof allSoundAssets;

export default allSoundAssets;
