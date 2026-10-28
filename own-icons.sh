#!/bin/sh
# CleanYourTV: puts your own app logos in place. Copy the files to /tmp/logos on the TV first (any names that say which app they
# are: netflix.svg, Disney+.svg, Apple_TV.svg, Spotify.svg, HBO_Max.svg, YouTube.png, Prime_Video.svg ...), then run this ON the TV:
#   curl -fsSL https://raw.githubusercontent.com/Mikasssa/cleanyourtv-WebOS-themes/tv-build/own-icons.sh | sh
# Each file is matched to an installed app by name and copied to /media/developer/cleanyourtv/icons/<app id>.<ext>; Home reloads.
# Undo for one app: delete its file in /media/developer/cleanyourtv/icons (then open Home again).
SRC="${1:-/tmp/logos}"
DST=/media/developer/cleanyourtv/icons
[ -d "$SRC" ] || { echo "no folder $SRC: copy your logos there first"; exit 1; }
mkdir -p "$DST"
curl -fsS 127.0.0.1:8765/api/apps > /tmp/cytv-apps.json || { echo "the CleanYourTV service does not answer"; exit 1; }
node -e '
var fs = require("fs"), path = require("path"), src = process.argv[1], dst = process.argv[2];
var apps = (JSON.parse(fs.readFileSync("/tmp/cytv-apps.json", "utf8")).apps || []);
var RULES = [
  [/disney/i, /disney/i],
  [/apple/i, /apple ?tv/i],
  [/netflix/i, /netflix/i],
  [/spotify/i, /spotify/i],
  [/hbo|max/i, /^(hbo ?)?max$|hbo/i],
  [/youtube|^yt/i, /^youtube$/i],
  [/prime|amazon/i, /prime video|amazon/i]
];
var EXT = [".svg", ".png", ".webp", ".jpg"];
fs.readdirSync(src).forEach(function (f) {
  var ext = path.extname(f).toLowerCase();
  if (EXT.indexOf(ext) < 0) return;
  var rule = RULES.filter(function (r) { return r[0].test(f); })[0];
  var app = rule && apps.filter(function (a) { return rule[1].test(a.title || ""); })[0];
  if (!app) {
    var base = path.basename(f, ext).replace(/^[0-9a-f]{8}-\d+_/i, "").replace(/[_-]+/g, " ").toLowerCase();
    app = apps.filter(function (a) { return a.title && base.indexOf(a.title.toLowerCase()) >= 0; })[0];
  }
  if (!app) return console.log("  ?  " + f + ": no app found for it (rename the file after the app)");
  EXT.forEach(function (e) { try { fs.unlinkSync(path.join(dst, app.id + e)); } catch (_) {} });
  fs.writeFileSync(path.join(dst, app.id + ext), fs.readFileSync(path.join(src, f)));
  console.log("  ok " + f + " -> " + app.title + " (" + app.id + ")");
});
' "$SRC" "$DST"
rm -f /tmp/cytv-apps.json
[ -f /media/developer/cleanyourtv/reload-home.sh ] && sh /media/developer/cleanyourtv/reload-home.sh </dev/null >/dev/null 2>&1
echo "Done: open Home to see the new icons."
