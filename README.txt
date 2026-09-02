ONE FILE — public/buyer-calculator.html

The ZIP rate map was using CARTO's basemap, which now requires an API
key and stamps "API KEY REQUIRED" across every tile without one.

Switched to plain OpenStreetMap tiles — the same source your own
components/BuyerMap.jsx already uses. Free, no key, no watermark.

TO APPLY, on your Mac, one line at a time:

  cd ~/Desktop/GreenLightBuyingMachine
  rm -rf /tmp/u && mkdir -p /tmp/u && unzip -oq ~/Downloads/FIX-MAP-TILES.zip -d /tmp/u
  ls /tmp/u
      -> if it shows a single folder, use that name in the next line
  cp -R /tmp/u/FIX-MAP-TILES/public/. public/
  grep -c "tile.openstreetmap" public/buyer-calculator.html
      -> must print 1
  git add -A
  git commit -m "Map tiles: OpenStreetMap instead of CARTO"
  git push
