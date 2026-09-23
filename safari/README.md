# LegitHire for Safari

Same extension as the Chrome version: same rules, model, labels, popup,
feedback and dataset mode. The only difference is where the model runs.
Safari has no offscreen documents, so the model runs in Safari's background
page instead, which is still off LinkedIn's main thread.

Safari extensions ship inside a small macOS app, and building that app needs **Xcode**.

## If this Mac has the source code

```sh
npm install
npm run fetch-model     # once
npm run build:safari    # -> safari/extension/
npm run safari:xcode    # creates the Xcode project, builds the app, opens it
```

## If Xcode is on a different Mac

Build `safari/extension/` here (`npm run build:safari`), copy the whole
`safari/` folder to the Mac with Xcode, and run:

```sh
sh safari/create-xcode-project.sh
```

That Mac doesn't need Node or npm.

## Enable it in Safari

1. **Settings → Advanced**: tick *Show features for web developers*.
2. **Settings → Developer**: tick *Allow unsigned extensions*. Safari turns
   this off each time it quits, so re-tick it after restarting Safari.
3. **Settings → Extensions**: tick **LegitHire** and allow it on `www.linkedin.com`.
4. Open https://www.linkedin.com/feed/ and scroll.

Click the LegitHire icon next to the address bar to open the popup. For
debug logs, turn on Debug mode and open **Develop → Show Web Inspector** on the
LinkedIn tab (filter by `LegitHire`). Model logs are under
**Develop → Web Extension Background Content → LegitHire**.

## Updating

Run `npm run build:safari` again, then in Xcode choose **Product → Build**
(or re-run the script) and reopen the app.

## Notes

- The first model call after Safari has been idle for a while takes a second
  or two: Safari unloads idle background pages, and the model loads again when
  it wakes. Rules-only labels are always instant.
- To publish on the App Store you need an Apple Developer account: open
  `safari/LegitHire/LegitHire.xcodeproj`, set your team under
  *Signing & Capabilities*, and archive.
