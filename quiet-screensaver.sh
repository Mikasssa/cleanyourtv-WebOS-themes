#!/bin/sh
# CleanYourTV extra: LG's screen saver without the line "To turn the screen back on, please press any button except for the power
# button." The clock and the rest stay. Nothing on the TV's own files changes: a copy of the screen saver's texts (its i18n folder) is
# made in RAM with that one line left blank, in every language, and mounted over the original until the next restart. A boot script
# does this again at every start.
#   sh quiet-screensaver.sh install   puts the boot script in place and does it now
#   sh quiet-screensaver.sh undo      takes it away again (the original texts are back at once)
#   sh quiet-screensaver.sh status    says whether it is on
# Run on the TV as root. If a start ever goes wrong, the Homebrew Channel's failsafe mode skips the boot scripts.
export PATH=/usr/bin:/usr/sbin:/bin:/sbin:$PATH
I=/usr/palm/applications/com.webos.app.screensaver/data/flutter_assets/assets/i18n
T=/tmp/cytv-quiet-screensaver
BOOT=/var/lib/webosbrew/init.d/20-cytv-quiet-screensaver
URL=https://raw.githubusercontent.com/Mikasssa/cleanyourtv-WebOS-themes/tv-build/quiet-screensaver.sh
mounted() { grep -q " $I " /proc/mounts; }

apply() {
  [ -d "$I" ] || { echo "the screen saver's texts are not where they were expected ($I): nothing done"; return 1; }
  mounted && { echo "already on"; return 0; }
  rm -rf "$T" && mkdir -p "$T" || { echo "could not make $T: nothing done"; return 1; }
  # node copies every file (no shell wildcard) and blanks the line, found by its English text, the key in every language's file
  c=$(node -e '
var fs = require("fs"), src = process.argv[1], dst = process.argv[2], n = 0, files = 0;
fs.readdirSync(src).forEach(function (f) {
  var b;
  try { b = fs.readFileSync(src + "/" + f); } catch (e) { return; }
  files++;
  if (/\.json$/i.test(f)) {
    try {
      var j = JSON.parse(b.toString("utf8")), hit = false;
      Object.keys(j).forEach(function (k) {
        if (/press any button except for the power button/i.test(k)) { j[k] = " "; hit = true; }
      });
      if (hit) { b = Buffer.from(JSON.stringify(j)); n++; }
    } catch (e) {}
  }
  fs.writeFileSync(dst + "/" + f, b);
});
console.log(n + " " + files);
' "$I" "$T" 2>&1)
  set -- $c
  if [ "${1:-0}" -gt 0 ] 2>/dev/null; then :; else
    rm -rf "$T"; echo "the line was not found (node said: $c; files there:)"; ls -la "$I" | head -8; return 1
  fi
  mount --bind "$T" "$I" || { rm -rf "$T"; echo "the mount failed: nothing done"; return 1; }
  echo "on: the line is blank in $1 of $2 files"
}

case "$1" in
  install)
    mkdir -p "$(dirname $BOOT)"
    printf '#!/bin/sh\n# CleanYourTV extra: the screen saver without its "press any button" line (undo: sh %s undo, or delete this file)\n[ -f /media/developer/cleanyourtv/quiet-screensaver.sh ] && sh /media/developer/cleanyourtv/quiet-screensaver.sh apply >/tmp/cytv-quiet-screensaver.log 2>&1\n' /media/developer/cleanyourtv/quiet-screensaver.sh > "$BOOT"
    chmod 755 "$BOOT"
    mkdir -p /media/developer/cleanyourtv
    if [ -f "$0" ] && [ "$0" != /media/developer/cleanyourtv/quiet-screensaver.sh ]; then cp "$0" /media/developer/cleanyourtv/quiet-screensaver.sh
    else curl -fsSL -o /media/developer/cleanyourtv/quiet-screensaver.sh "$URL"; fi
    apply
    echo "boot script: $BOOT"
    ;;
  apply) apply ;;
  undo)
    rm -f "$BOOT" /media/developer/cleanyourtv/quiet-screensaver.sh
    mounted && umount "$I"
    rm -rf "$T"
    echo "off: the screen saver has its own texts again"
    ;;
  status)
    if mounted; then echo "on"; else echo "off"; fi
    [ -f "$BOOT" ] && echo "boot script: $BOOT" || echo "no boot script"
    ;;
  *) echo "usage: sh quiet-screensaver.sh install|undo|status" ;;
esac
