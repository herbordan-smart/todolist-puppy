#!/bin/bash
SERVER="http://10.40.33.19:3030"
DEST="$HOME/goose-todo/assets"
curl -s "$SERVER/dog-working.png" -o "$DEST/dog-working.png"
curl -s "$SERVER/dog-sleeping.png" -o "$DEST/dog-sleeping.png"
curl -s "$SERVER/dog-ready.png" -o "$DEST/dog-ready.png"
curl -s "$SERVER/dog-waiting.png" -o "$DEST/dog-waiting.png"
ls -lh "$DEST"/dog-*.png
