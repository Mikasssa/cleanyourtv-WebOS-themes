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
  rm -rf "$T" && mkdir -p "$T" && cp "$I"/*.json "$T"/ || { echo "could not copy the texts: nothing done"; return 1; }
  # the line is found by its English text, which is the key in every language's file; its translation becomes one space
  node -e '
var fs = require("fs"), d = process.argv[1], n = 0;
fs.readdirSync(d).forEach(function (f) {
  if (!/\.json$/.test(f)) return;
  var p = d + "/" + f, j;
  try { j = JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return; }
  var hit = false;
  Object.keys(j).forEach(function (k) {
    if (/press any button except for the power button/i.test(k)) { j[k] = " "; hit = true; }
  });
  if (hit) { fs.writeFileSync(p, JSON.stringify(j)); n++; }
});
console.log(n);
' "$T" > "$T/.count" 2>/dev/null
  c=$(cat "$T/.count" 2>/dev/null)
  rm -f "$T/.count"
  [ "${c:-0}" -gt 0 ] || { rm -rf "$T"; echo "the line was not found in the texts (a new firmware?): nothing done"; return 1; }
  mount --bind "$T" "$I" || { rm -rf "$T"; echo "the mount failed: nothing done"; return 1; }
  echo "on: the line is blank in $c language files"
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
