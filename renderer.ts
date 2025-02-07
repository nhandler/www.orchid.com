import "zone.js/dist/zone-node";
import "reflect-metadata";

import {enableProdMode} from "@angular/core";
import {renderModuleFactory} from "@angular/platform-server";
import {Routes} from "@angular/router";
import {provideModuleMap} from "@nguniversal/module-map-ngfactory-loader";
import {spawnSync} from "child_process";
import {readFileSync, writeFileSync} from "fs";
import {copySync, emptyDirSync} from "fs-extra";
import {basename, join} from "path";

import {routes} from "./src/app/routes";

function genRoutes(routes: Routes): string[] {
  function recurse(routes: Routes): string[] {
    return Array.prototype.concat.apply(
      [],
      routes
        .filter(r => r.component) // Make sure this isn't a redirect route
        .map(r => r.children
                    ? genRoutes(r.children).map(child => join(r.path, child))
                    : [r.path]));
  }

  return recurse(routes).map(r => join("/", r));
}

function getRepo(): string {
  const remotes = spawnSync("git", ["remote", "-v"])
                    .stdout.toString()
                    .split("\n")
                    .map(l => l.trim())
                    .filter(l => /origin/.test(l) && /push/.test(l));

  if (!remotes.length)
    throw new Error("couldn't find any Git remotes named 'origin'");

  return remotes[0].split(/\s+/)[1];
}

function getHead(): string {
  return spawnSync("git", ["rev-parse", "HEAD"]).stdout.toString().trim();
}

enableProdMode();

const DIST_FOLDER   = join(process.cwd(), "dist");
const IN_FOLDER     = join(DIST_FOLDER, "browser");
const OUT_FOLDER    = join(DIST_FOLDER, "static");
const TEMPLATE_FILE = join(IN_FOLDER, "index.html");
const VERSION_FILE  = join(OUT_FOLDER, "version.html");

const GIT_REPO = getRepo();
const GIT_HEAD = getHead();

const template = readFileSync(TEMPLATE_FILE).toString();

const {AppServerModuleNgFactory,
       LAZY_MODULE_MAP} = require("./dist/server/main");

emptyDirSync(OUT_FOLDER);

copySync(IN_FOLDER, OUT_FOLDER, {
  filter(src: string, dest: string): boolean { return src != TEMPLATE_FILE; }
})

genRoutes(routes).forEach(url => {
  const outFile = join(
    OUT_FOLDER,
    `${basename(url).length === 0 ? join(url, "index") : url}.html`);

  renderModuleFactory(AppServerModuleNgFactory, {
    document: template,
    url: url,
    extraProviders: [
      provideModuleMap(LAZY_MODULE_MAP),
    ]
  }).then(html => {
    console.log(`Rendered '${url}' to '${outFile}'`);
    writeFileSync(outFile, html)
  });
});

writeFileSync(VERSION_FILE,
              `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Orchid</title>
</head>
<body>
  <pre>Git Repository: ${GIT_REPO}
Deployed Hash: ${GIT_HEAD}</pre>
</body>
</html>`);
