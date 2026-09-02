ONE FILE — public/buyer-calculator.html

NEW: "HOW MANY HOUSES" PANEL

Sits just above the projection. A row of house emojis, a big count,
and minus / plus buttons.

  - and +        one house at a time
  Max my capital  back to as many as the capital allows

Four figures update as you step:

  Capital needed      or "Still need $X" in red when you have gone
                      past what your capital covers
  Cash flow / month
  Cash flow / year
  Equity by year N    from the projection below

This runs the calculation the other way round. Everywhere else on
the page capital decides the house count. Here the house count
decides the capital, because "I want six" is how a buyer actually
thinks about it.

One emoji per house up to 30, then "+N more" — thirty is already more
than anyone reads and a hundred is a wall of noise.

TO APPLY, on your Mac, ONE LINE AT A TIME

  cd ~/Desktop/GreenLightBuyingMachine

  git pull --rebase
      Do this first. Your last push was rejected because GitHub has a
      commit your Mac does not.

  rm -rf /tmp/u && mkdir -p /tmp/u && unzip -oq ~/Downloads/HOUSE-PICKER.zip -d /tmp/u

  ls /tmp/u
      Safari may have already expanded it. If you see HOUSE-PICKER,
      use the first cp line. If you see "public", use the second.

  cp -R /tmp/u/HOUSE-PICKER/public/. public/
  cp -R /tmp/u/public/. public/

  grep -c "How many houses" public/buyer-calculator.html
      Must print 1.

  git add -A
  git commit -m "House picker on the calculator"
  git push
