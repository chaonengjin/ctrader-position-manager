# Position Manager V1 for cTrader

This is the first web-based prototype for a cTrader Position Manager.

## Files

- `index.html` - page structure
- `styles.css` - responsive UI
- `app.js` - cTrader Plugin SDK integration
- `README.md` - deployment notes

## Current V1 functions

- cTrader theme detection (`theme=light|dark`)
- placement detection (`placement=...`)
- authenticated account information
- balance / equity / used margin / free margin display
- execution-event based position cache
- live quote subscription for positions received during the session
- Break-even button
- 1R button
- Close 50%
- Close full position

## Important V1 limitation

The current public cTrader Web Plugin SDK documentation provides account information,
quotes and execution events, but does not document a general request for an existing
open-position snapshot.

Therefore this V1 does not fabricate an initial position list. Positions are populated
from execution events received after the plugin connects.

This is intentional. It prevents the UI from showing stale or invented trading data.

## Deployment

The plugin builder requires a public HTTPS URL. cTrader documents the workflow as:

1. Create the web application with HTML/CSS/JavaScript and the Plugin SDK.
2. Deploy it to any hosting provider.
3. Use the resulting URL in the cTrader Web Plugin Builder.
4. Enable and test the desired placements.
5. Publish only after testing.

### Recommended simple hosting: GitHub Pages

1. Create a GitHub repository, for example `ctrader-position-manager`.
2. Upload `index.html`, `styles.css`, `app.js`, and `README.md`.
3. In the repository settings, open Pages.
4. Set the deployment source to the `main` branch and root folder.
5. Wait for GitHub Pages to publish.
6. Your URL will look like:
   `https://YOUR-USERNAME.github.io/ctrader-position-manager/`

Use that HTTPS URL in the cTrader Builder URL field.

### Local visual test

Opening `index.html` directly in a browser can test the UI, but it will not authenticate
with cTrader. The trading SDK requires the page to run inside cTrader as a web-based plugin.

## cTrader Builder

Suggested V1 placements:

Mobile:
- Trade app bottom sheet: ON, 60%
- Symbol Overview bottom sheet: OFF
- Symbol Overview embedded block: OFF

Desktop:
- ASP block: ON
- ASP tab: ON
- Trade Watch tab: ON
- Separate window: ON
- Quick access bottom: ON
- Quick access top: OFF

## Security / domain

The cTrader plugin must load from the domain specified in the builder. Avoid redirects
to another domain. External links should be opened in a new browser tab.

Do not put broker passwords, cTrader OAuth secrets, or private API keys in this frontend.
The Plugin SDK uses the authenticated cTrader host session.
