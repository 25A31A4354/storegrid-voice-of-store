# StoreGrid: run it on your own computer

StoreGrid (Team InnoForge, 000911) turns store feedback into a prioritised, routed action list. It is built for
TalentAP Mega Hackathon 2026, problem R5. This bundle includes the hackathon's synthetic sample data, so it works
with one command and nothing leaves your computer.

## What you need

| | |
|---|---|
| **Node.js** | 22.13 or newer ([nodejs.org](https://nodejs.org)) |
| **Python** | 3.11 or newer ([python.org](https://www.python.org)) |
| **Disk and time** | about 1 GB; the first run installs packages (3 to 6 minutes) |
| **Internet** | only for the first run, to download packages |

Works on macOS, Linux and Windows.

## Run it

Open a terminal in this folder and run:

```bash
node run.js
```

When it prints **"StoreGrid is running"**, open **http://localhost:5173**. Press Ctrl+C in the terminal to stop it.

The first start installs everything, trains the classifier (about 15 seconds) and loads one week of demo feedback
(about a minute). Later starts are much faster.

## What to try

1. **Overview**: the urgent comments come first, then the path from comments to action.
2. **Add a comment**: pick a store, then choose an example comment such as the Hinglish allergen one. It is labelled live.
3. **Second look**: comments the model was unsure about.
4. **Trends**: volume over time and stores with an unusual jump.
5. **Weekly briefs**: one page per region, with a Download button.
6. **Import data**: upload CSV, Excel (.xlsx) or JSON.

## Good to know

- All data here is **synthetic** (generated for the hackathon). No real customer data.
- There is **no login**. Run it on your own computer, not on a public server.
- The dashboard shows a real week of the sample data with dates moved to the present, for display only.
- Ports used: 5173 (dashboard), 5001 (API), 8000 (classifier). Stop other programs on these ports first.

## If something goes wrong

| Message | What to do |
|---|---|
| "Node 22.13 or newer is required" | Install a newer Node.js |
| "Python 3.11 or newer is required" | Install a newer Python |
| A port is already in use | Close the program using it, or set `PORT=5002` before `node run.js` |
| The first start seems stuck | The first run downloads packages. Wait up to 10 minutes on a slow connection |

## What is inside

```
run.js                one-command setup and start
RUN_ME.md             this file
README.md             the project's own README (architecture, AI usage, limits)
DATA_LICENSE.md       licence of the sample data
FULL_CODE/nlp         classifier service, weekly detector, brief generator
FULL_CODE/api         Node API and database
FULL_CODE/web         React dashboard
FULL_CODE/data        the hackathon sample data
submission/           the three files submitted to the hackathon
```

Run the checks with the commands in `README.md` ("How to run the tests"). The code is MIT licensed (see `LICENSE`).
