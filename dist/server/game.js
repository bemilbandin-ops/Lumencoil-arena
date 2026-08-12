import fs from "node:fs";
import { CONFIG, SKINS } from "../shared/config.js";
import { resolveBodyContact, resolveHeadContact } from "../shared/combat.js";
import { clamp, distanceSq, normalizeAngle } from "../shared/types.js";
import { createBrain, decideBot } from "./botAI.js";
import { SpatialHash } from "./spatialHash.js";

const encoded = [1, 2, 3, 4, 5]
  .map(i => fs.readFileSync(new URL(`./game.bundle.${i}.b64`, import.meta.url), "utf8"))
  .join("");
let source = Buffer.from(encoded, "base64").toString("utf8");
source = source.split("\n").filter(line => !line.startsWith("import ")).join("\n");
source = source.replace("export class GameWorld", "class GameWorld");

export const GameWorld = new Function(
  "CONFIG", "SKINS", "resolveBodyContact", "resolveHeadContact",
  "clamp", "distanceSq", "normalizeAngle", "createBrain", "decideBot", "SpatialHash",
  `${source}\nreturn GameWorld;`
)(CONFIG, SKINS, resolveBodyContact, resolveHeadContact, clamp, distanceSq, normalizeAngle, createBrain, decideBot, SpatialHash);
