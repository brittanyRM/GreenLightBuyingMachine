ONE FILE — public/buyer-calculator.html

TWO ADDITIONS

1. OCCUPANCY SLIDER
   Sits under the four headline figures. Drag it and cash flow, DSCR
   and cash-on-cash move live.

   The track is shaded, and the two lines on it are solved, not
   guessed:

     red    below break-even       48% on the default deal
     amber  up to DSCR 1.25        56%, the level lenders want
     green  above that

   Under it, in words: "Rooms could sit 47 points emptier than this
   before the house stops covering its own debt."

   Break-even lands where it does because three of the five operating
   costs scale with rent and two do not — utilities, taxes and
   insurance are fixed, so they are what set the floor. Verified: at
   the computed break-even, cash flow is exactly $0.

2. HOW MANY HOUSES
   Above the projection. House emojis, a big count, minus and plus,
   and a "Max my capital" reset. Four figures move with it: capital
   needed, cash flow per month, per year, and equity at year N.

   Push past what your capital covers and the first tile turns red —
   "Still need $423,045" — with the two real options named.

   This runs the calculation the other way round from the rest of the
   page. Elsewhere capital decides the house count; here the house
   count decides the capital, because "I want six" is how a buyer
   actually thinks about it.


TO APPLY, on your Mac, ONE LINE AT A TIME

  cd ~/Desktop/GreenLightBuyingMachine

  git pull --rebase
      Do this FIRST. Your last push was rejected because GitHub has a
      commit your Mac does not have.

  rm -rf /tmp/u && mkdir -p /tmp/u && unzip -oq ~/Downloads/CALC-SLIDERS.zip -d /tmp/u

  ls /tmp/u
      Safari may expand it for you. If you see CALC-SLIDERS, use the
      first cp line below. If you see "public", use the second.

  cp -R /tmp/u/CALC-SLIDERS/public/. public/
  cp -R /tmp/u/public/. public/

  grep -c "occ-range" public/buyer-calculator.html
      Must print more than 0. If it prints 0, stop.

  git add -A
  git commit -m "Occupancy slider and house picker"
  git push
